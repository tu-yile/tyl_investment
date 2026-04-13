export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function stringifyExtra(extra: unknown): string {
  if (extra === null || extra === undefined) {
    return "";
  }
  try {
    return JSON.stringify(extra, null, 2);
  } catch (_error) {
    return String(extra);
  }
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTimeInputValue(date: Date): string {
  const day = formatDateInputValue(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}T${hours}:${minutes}`;
}

export function parseDateInputValue(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function formatChinaTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return "";
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(parsed);
  const readPart = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value || "";

  return `${readPart("year")}/${readPart("month")}/${readPart("day")} ${readPart("hour")}:${readPart("minute")}:${readPart("second")}`;
}
