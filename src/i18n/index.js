import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './locales/en/translation.json';
import translationVI from './locales/vi/translation.json';

const resources = {
    en: {
        translation: translationEN
    },
    vi: {
        translation: translationVI
    }
};

/**
 * Vietnamese is the product default. A visitor who has explicitly picked a
 * language keeps it (the detector caches the choice in localStorage), but the
 * browser's own locale is deliberately not consulted: reading it would make
 * the "default" still depend on which machine you open the app on.
 */
export const DEFAULT_LANGUAGE = 'vi';
export const SUPPORTED_LANGUAGES = ['en', 'vi'];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGES,
        debug: false,

        interpolation: {
            escapeValue: false
        },

        detection: {
            // An explicit choice wins; with nothing stored the app opens in
            // Vietnamese through fallbackLng.
            order: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
            caches: ['localStorage'],
            // Older builds cached region-qualified codes such as 'en-US'.
            // Reduce them to the base language: without this i18n.language
            // stays 'en-US', the bundle still loads English, but the Header
            // buttons compare against 'en' / 'vi' and leave both unhighlighted.
            convertDetectedLanguage: (lng) =>
                String(lng).split(/[-_]/)[0].toLowerCase()
        }
    });

/**
 * index.html opens with lang="vi" to match the default; keep the attribute
 * truthful when the visitor switches to English, so screen readers and the
 * browser's translate prompt follow the UI instead of contradicting it.
 */
const applyDocumentLanguage = (lng) => {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = (lng || DEFAULT_LANGUAGE).slice(0, 2);
    }
};

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
