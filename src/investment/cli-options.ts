export function parseOption(options: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return options.find((option) => option.startsWith(prefix))?.slice(prefix.length);
}

export function parseOptions(options: string[], name: string): string[] {
  const prefix = `--${name}=`;
  return options
    .filter((option) => option.startsWith(prefix))
    .map((option) => option.slice(prefix.length));
}

export function hasOption(options: string[], name: string): boolean {
  return options.includes(`--${name}`);
}
