import i18n from "../i18n";

/**
 * Language code sent to backend Excel export APIs.
 * Matches frontend i18n selection (en / vi).
 */
export const getExportLocale = () => {
  const lang = (i18n.language || "en").toLowerCase();
  return lang.startsWith("vi") ? "vi" : "en";
};
