import i18next from "i18next";
import { moment } from "obsidian";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

/** Язык Obsidian выбирается в Settings → General → Interface language */
const uiLocale = moment.locale();
const supported = ["en", "ru"];
const lng = supported.includes(uiLocale) ? uiLocale : "en";

i18next.init({
  lng,
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  returnNull: false,
});

/** Удобная короткая ссылка */
export const t = i18next.t.bind(i18next);