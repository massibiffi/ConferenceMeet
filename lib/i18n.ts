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
