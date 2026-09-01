// Intl polyfills must load before i18next.init() runs, and before any other
// import that might touch Intl - Hermes only partially implements the Intl
// API (notably missing Intl.PluralRules), which i18next needs to resolve
// plural forms correctly. Without this, i18next logs an error and falls back
// to English-only one/other plural rules for every language, which silently
// breaks pluralization in French/Spanish/Arabic (Arabic in particular has far
// more plural categories than English: zero/one/two/few/many/other).
import { shouldPolyfill as shouldPolyfillGetCanonicalLocales } from "@formatjs/intl-getcanonicallocales/should-polyfill";
import { shouldPolyfill as shouldPolyfillLocale } from "@formatjs/intl-locale/should-polyfill";
import { shouldPolyfill as shouldPolyfillPluralRules } from "@formatjs/intl-pluralrules/should-polyfill";

if (shouldPolyfillGetCanonicalLocales()) {
  require("@formatjs/intl-getcanonicallocales/polyfill");
}
if (shouldPolyfillLocale()) {
  require("@formatjs/intl-locale/polyfill");
}
if (shouldPolyfillPluralRules()) {
  require("@formatjs/intl-pluralrules/polyfill");
  require("@formatjs/intl-pluralrules/locale-data/en");
  require("@formatjs/intl-pluralrules/locale-data/fr");
  require("@formatjs/intl-pluralrules/locale-data/es");
  require("@formatjs/intl-pluralrules/locale-data/ar");
}

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import ar from "@/locales/ar.json";
import { normalize, isRTL, SUPPORTED_LANGUAGES, type Language } from "./lang";

export { SUPPORTED_LANGUAGES };
export type { Language };

const STORAGE_KEY = "app.language";

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  ar: { translation: ar },
};

/** Applies RTL/LTR layout for a language. Note: a flip may need an app reload
 *  to fully take effect (RN caches layout direction natively). */
export function applyDirection(lang: Language) {
  const shouldRTL = isRTL(lang);
  I18nManager.allowRTL(shouldRTL);
  if (I18nManager.isRTL !== shouldRTL) {
    I18nManager.forceRTL(shouldRTL);
  }
}

// Pick the stored language if any, else the device language, else English.
const deviceLang = normalize(getLocales()[0]?.languageCode ?? "en");

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyDirection(deviceLang);

// Hydrate a previously chosen language (async; overrides device default).
AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (saved && saved !== i18n.language) {
    const lang = normalize(saved);
    i18n.changeLanguage(lang);
    applyDirection(lang);
  }
});

/** Change language app-wide and persist the choice. */
export async function setLanguage(lang: Language) {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  applyDirection(lang);
}

export default i18n;
