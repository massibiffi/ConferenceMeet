// Pure language helpers — no React Native / i18next imports, so unit-testable.

export const SUPPORTED_LANGUAGES = ["en", "fr", "es", "ar"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const RTL_LANGUAGES: Language[] = ["ar"];

export const DEFAULT_LANGUAGE: Language = "en";

/** Map any locale code (e.g. "en-US", "AR") to a supported language, else English. */
export function normalize(code?: string): Language {
  const short = (code ?? DEFAULT_LANGUAGE).split("-")[0].toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(short)
    ? (short as Language)
    : DEFAULT_LANGUAGE;
}

export function isRTL(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}
