export type SupportedLocale = "en" | "zh";

export function detectCliLocale(
  environment: Readonly<Record<string, string | undefined>> = process.env
): SupportedLocale {
  const value = environment.DIVEBELL_LANG
    ?? environment.LC_ALL
    ?? environment.LC_MESSAGES
    ?? environment.LANG
    ?? environment.LANGUAGE
    ?? "";
  return /^zh(?:[_-]|$)/i.test(value.trim()) ? "zh" : "en";
}

export function cliText(
  english: string,
  chinese: string,
  environment?: Readonly<Record<string, string | undefined>>
): string {
  return detectCliLocale(environment).startsWith("zh") ? chinese : english;
}
