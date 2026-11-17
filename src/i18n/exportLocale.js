import i18n, { DEFAULT_LANGUAGE } from "../i18n";

/**
 * Language code sent to backend Excel export APIs.
 * Matches frontend i18n selection (en / vi).
 */
export const getExportLocale = () => {
  const lang = (i18n.language || DEFAULT_LANGUAGE).toLowerCase();
  return lang.startsWith("vi") ? "vi" : "en";
};
