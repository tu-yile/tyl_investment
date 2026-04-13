import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  CollectionSubject,
  DailyRunCollected,
  DailyRunGraphState,
  InformationEvent,
  SourceLogItem,
  SourceType,
  TimeWindow,
} from "../workflows/daily-position-decision/types.js";

interface ProviderResult {
  events: InformationEvent[];
  sourceLog: SourceLogItem[];
  coverageNotes: string[];
}

interface AnnouncementProvider {
  collect(args: {
    timeWindow: TimeWindow;
    subjects: CollectionSubject[];
  }): Promise<ProviderResult>;
}

interface NewsFeedProvider {
  collect(args: {
    timeWindow: TimeWindow;
    subjects: CollectionSubject[];
  }): Promise<ProviderResult>;
}

interface SearchBackfillProvider {
  collect(args: {
    timeWindow: TimeWindow;
    subjects: CollectionSubject[];
    existingEvents: InformationEvent[];
  }): Promise<ProviderResult>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  trimValues: true,
});

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeUrl(url: string, base?: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function toIsoTime(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return new Date(timestamp).toISOString();
}

function withinTimeWindow(value: string, timeWindow: TimeWindow): boolean {
  const ts = Date.parse(value);
  const start = Date.parse(timeWindow.start);
  const end = Date.parse(timeWindow.end);
  if (Number.isNaN(ts) || Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return ts >= start && ts <= end;
}

function makeEventId(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

function dedupeEvents(events: InformationEvent[]): InformationEvent[] {
  const map = new Map<string, InformationEvent>();
  for (const event of events) {
    const key = `${event.source}|${event.url}|${event.title}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  }
  return [...map.values()].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function buildSourceLog(
  source: string,
  sourceType: SourceType,
  query: string,
  itemCount: number,
): SourceLogItem {
  return {
    source,
    sourceType,
    query,
    fetchedAt: nowIso(),
    itemCount,
  };
}

function collapseDescription(raw: string | undefined): string {
  if (!raw) {
    return "";
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function subjectMatchesText(subject: CollectionSubject, text: string): boolean {
  const haystack = text.toLowerCase();
  return subject.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function detectImpactHint(text: string): InformationEvent["impactHint"] {
  const haystack = text.toLowerCase();
  if (/(增长|上调|签约|中标|突破|增持|回购|盈利|创新高)/i.test(haystack)) {
    return "positive";
  }
  if (/(下滑|下调|诉讼|减持|亏损|终止|处罚|违约|预警)/i.test(haystack)) {
    return "negative";
  }
  if (/(波动|争议|调整|重组|并购|公告)/i.test(haystack)) {
    return "mixed";
  }
  return "neutral";
}

function mapMarketTags(title: string, summary: string): string[] {
  const text = `${title} ${summary}`;
  const tags = new Set<string>();
  if (/政策|监管|国常会|央行|财政/i.test(text)) {
    tags.add("policy");
  }
  if (/流动性|利率|汇率|债券|降准|降息/i.test(text)) {
    tags.add("liquidity");
  }
  if (/业绩|财报|预告|分红|回购/i.test(text)) {
    tags.add("earnings");
  }
  if (/公告/i.test(text)) {
    tags.add("announcement");
  }
  return [...tags];
}

function classifyLevel(subject: CollectionSubject | undefined): InformationEvent["level"] {
  return subject?.level ?? "market";
}

class SseAnnouncementProvider implements AnnouncementProvider {
  async collect(args: { timeWindow: TimeWindow; subjects: CollectionSubject[] }): Promise<ProviderResult> {
    const events: InformationEvent[] = [];
    const sourceLog: SourceLogItem[] = [];
    const coverageNotes: string[] = [];
    const companySubjects = args.subjects.filter(
      (subject) => subject.level === "company" && subject.ticker && /^(5|6|9)\d{5}$/.test(subject.ticker),
    );

    if (companySubjects.length === 0) {
      coverageNotes.push("SSE announcement provider skipped: no SSE ticker in current subjects.");
      return { events, sourceLog, coverageNotes };
    }

    for (const subject of companySubjects) {
      const url = new URL("https://query.sse.com.cn/security/stock/queryCompanyBulletinNew.do");
      url.searchParams.set("isPagination", "true");
      url.searchParams.set("pageHelp.pageSize", "20");
      url.searchParams.set("pageHelp.pageNo", "1");
      url.searchParams.set("pageHelp.cacheSize", "1");
      url.searchParams.set("START_DATE", args.timeWindow.start.slice(0, 10));
      url.searchParams.set("END_DATE", args.timeWindow.end.slice(0, 10));
      url.searchParams.set("SECURITY_CODE", subject.ticker ?? "");
      url.searchParams.set("TITLE", "");
      url.searchParams.set("BULLETIN_TYPE", "");
      url.searchParams.set("stockType", "");

      try {
        const response = await fetch(url, {
          headers: {
            referer: "https://www.sse.com.cn/disclosure/listedinfo/announcement/",
            "user-agent": "Mozilla/5.0",
          },
        });
        const payload = (await response.json()) as {
          pageHelp?: { data?: Array<Array<Record<string, unknown>>> };
        };
        const rows = (payload.pageHelp?.data ?? []).flat();
        sourceLog.push(buildSourceLog("sse-announcements", "announcements", subject.ticker ?? "", rows.length));

        for (const row of rows) {
          const publishedAt = typeof row.SSEDATE === "string" ? `${row.SSEDATE}T00:00:00+08:00` : undefined;
          if (!publishedAt || !withinTimeWindow(publishedAt, args.timeWindow)) {
            continue;
          }
          const title = String(row.TITLE ?? "");
          const event: InformationEvent = {
            eventId: makeEventId(["sse", String(row.ORG_BULLETIN_ID ?? ""), title]),
            level: "company",
            publishedAt: new Date(publishedAt).toISOString(),
            source: "Shanghai Stock Exchange",
            sourceType: "announcements",
            title,
            summary: title,
            url: normalizeUrl(String(row.URL ?? ""), "https://www.sse.com.cn"),
            ticker: subject.ticker,
            industryId: subject.industryId,
            marketTags: ["announcement"],
            impactHint: detectImpactHint(title),
            confidence: 0.88,
          };
          events.push(event);
        }
      } catch (error) {
        coverageNotes.push(
          `SSE announcement provider failed for ${subject.ticker}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { events, sourceLog, coverageNotes };
  }
}

class SzseAnnouncementProvider implements AnnouncementProvider {
  async collect(args: { timeWindow: TimeWindow; subjects: CollectionSubject[] }): Promise<ProviderResult> {
    const companySubjects = args.subjects.filter(
      (subject) => subject.level === "company" && subject.ticker && /^(0|1|2|3)\d{5}$/.test(subject.ticker),
    );
    if (companySubjects.length === 0) {
      return {
        events: [],
        sourceLog: [],
        coverageNotes: ["SZSE announcement provider skipped: no SZSE ticker in current subjects."],
      };
    }

    return {
      events: [],
      sourceLog: companySubjects.map((subject) =>
        buildSourceLog("szse-announcements", "announcements", subject.ticker ?? "", 0),
      ),
      coverageNotes: [
        "SZSE announcement provider is reserved but no stable structured endpoint is configured yet; announcement gap recorded for SZSE tickers.",
      ],
    };
  }
}

class FixedRssNewsProvider implements NewsFeedProvider {
  private feeds = [
    {
      source: "Google News CN",
      url: "https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    },
    {
      source: "MarketWatch Top Stories",
      url: "https://www.marketwatch.com/rss/topstories",
    },
  ];

  async collect(args: { timeWindow: TimeWindow; subjects: CollectionSubject[] }): Promise<ProviderResult> {
    const events: InformationEvent[] = [];
    const sourceLog: SourceLogItem[] = [];
    const coverageNotes: string[] = [];

    for (const feed of this.feeds) {
      try {
        const response = await fetch(feed.url, {
          headers: { "user-agent": "Mozilla/5.0" },
        });
        const xml = await response.text();
        const parsed = xmlParser.parse(xml) as {
          rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } };
        };
        const items = parsed.rss?.channel?.item
          ? Array.isArray(parsed.rss.channel.item)
            ? parsed.rss.channel.item
            : [parsed.rss.channel.item]
          : [];
        sourceLog.push(buildSourceLog(feed.source, "news", feed.url, items.length));

        for (const item of items) {
          const title = String(item.title ?? "");
          const summary = collapseDescription(String(item.description ?? ""));
          const joined = `${title} ${summary}`;
          const matchingSubject =
            args.subjects.find((subject) => subjectMatchesText(subject, joined)) ??
            args.subjects.find((subject) => subject.level === "market");
          const publishedAt = toIsoTime(String(item.pubDate ?? "")) ?? nowIso();
          if (!withinTimeWindow(publishedAt, args.timeWindow)) {
            continue;
          }
          events.push({
            eventId: makeEventId([feed.source, String(item.guid ?? item.link ?? title)]),
            level: classifyLevel(matchingSubject),
            publishedAt,
            source: feed.source,
            sourceType: "news",
            title,
            summary,
            url: normalizeUrl(String(item.link ?? "")),
            ticker: matchingSubject?.ticker,
            industryId: matchingSubject?.industryId,
            marketTags: mapMarketTags(title, summary),
            impactHint: detectImpactHint(joined),
            confidence: 0.68,
          });
        }
      } catch (error) {
        coverageNotes.push(
          `RSS feed provider failed for ${feed.source}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { events, sourceLog, coverageNotes };
  }
}

class GoogleNewsSearchProvider implements SearchBackfillProvider {
  async collect(args: {
    timeWindow: TimeWindow;
    subjects: CollectionSubject[];
    existingEvents: InformationEvent[];
  }): Promise<ProviderResult> {
    const events: InformationEvent[] = [];
    const sourceLog: SourceLogItem[] = [];
    const coverageNotes: string[] = [];
    const coveredSubjects = new Set(
      args.existingEvents
        .map((event) => event.ticker ?? event.industryId ?? event.level)
        .filter((value): value is string => Boolean(value)),
    );

    const gapSubjects = args.subjects.filter((subject) => {
      const key = subject.ticker ?? subject.industryId ?? subject.level;
      return !coveredSubjects.has(key);
    });

    for (const subject of gapSubjects) {
      const query = subject.keywords[0] ?? subject.label;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
      try {
        const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
        const xml = await response.text();
        const parsed = xmlParser.parse(xml) as {
          rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } };
        };
        const items = parsed.rss?.channel?.item
          ? Array.isArray(parsed.rss.channel.item)
            ? parsed.rss.channel.item
            : [parsed.rss.channel.item]
          : [];
        sourceLog.push(buildSourceLog("google-news-search", "news", query, items.length));

        for (const item of items) {
          const title = String(item.title ?? "");
          const summary = collapseDescription(String(item.description ?? ""));
          const publishedAt = toIsoTime(String(item.pubDate ?? "")) ?? nowIso();
          if (!withinTimeWindow(publishedAt, args.timeWindow)) {
            continue;
          }
          events.push({
            eventId: makeEventId(["google-news-search", query, String(item.guid ?? item.link ?? title)]),
            level: subject.level,
            publishedAt,
            source: "Google News Search",
            sourceType: "news",
            title,
            summary,
            url: normalizeUrl(String(item.link ?? "")),
            ticker: subject.ticker,
            industryId: subject.industryId,
            marketTags: mapMarketTags(title, summary),
            impactHint: detectImpactHint(`${title} ${summary}`),
            confidence: 0.62,
          });
        }
      } catch (error) {
        coverageNotes.push(
          `Search backfill failed for ${query}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { events, sourceLog, coverageNotes };
  }
}

export async function collectInformation(
  state: DailyRunGraphState,
): Promise<Pick<DailyRunCollected, "informationEvents" | "coverageSummary" | "sourceLog">> {
  const providers: Array<AnnouncementProvider | NewsFeedProvider> = [
    new SseAnnouncementProvider(),
    new SzseAnnouncementProvider(),
    new FixedRssNewsProvider(),
  ];
  const searchBackfill = new GoogleNewsSearchProvider();

  const providerResults = await Promise.all(
    providers.map((provider) =>
      provider.collect({
        timeWindow: state.shared.collectionScope.timeWindow,
        subjects: state.shared.collectionScope.subjects,
      }),
    ),
  );

  const baseEvents = dedupeEvents(providerResults.flatMap((result) => result.events)).filter((event) =>
    withinTimeWindow(event.publishedAt, state.shared.collectionScope.timeWindow),
  );
  const backfillResult = await searchBackfill.collect({
    timeWindow: state.shared.collectionScope.timeWindow,
    subjects: state.shared.collectionScope.subjects,
    existingEvents: baseEvents,
  });

  const informationEvents = dedupeEvents([...baseEvents, ...backfillResult.events]);
  const sourceLog = [...providerResults.flatMap((result) => result.sourceLog), ...backfillResult.sourceLog];
  const coverageSummary = [
    ...providerResults.flatMap((result) => result.coverageNotes),
    ...backfillResult.coverageNotes,
  ];

  const uncoveredSubjects = state.shared.collectionScope.subjects.filter((subject) => {
    return !informationEvents.some(
      (event) =>
        event.ticker === subject.ticker ||
        event.industryId === subject.industryId ||
        subjectMatchesText(subject, `${event.title} ${event.summary}`),
    );
  });
  if (uncoveredSubjects.length > 0) {
    coverageSummary.push(
      `No matched information events for subjects: ${uncoveredSubjects.map((subject) => subject.label).join(", ")}`,
    );
  }

  return {
    informationEvents,
    coverageSummary,
    sourceLog,
  };
}
