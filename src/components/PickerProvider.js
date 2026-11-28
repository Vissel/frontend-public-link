import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import localeData from "dayjs/plugin/localeData";
import "dayjs/locale/vi";
import { useTranslation } from "react-i18next";

// The dayjs adapter needs localeData for non-English adapterLocale values.
dayjs.extend(localeData);

/**
 * App-wide date picker configuration.
 *
 * Native <input type="date"> renders its day/month/year order from the
 * visitor's browser settings and web pages cannot override it, so the app
 * uses MUI X pickers, which paint the field themselves. The formats below
 * pin day-first display (dd/mm/yyyy) in every browser and every language;
 * the values handed to the backend stay yyyy-MM-dd.
 *
 * Rule: never reintroduce TextField type="date" / type="datetime-local".
 */
const PickerProvider = ({ children }) => {
    const { i18n } = useTranslation();
    return (
        <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale={i18n.language && i18n.language.startsWith("vi") ? "vi" : "en"}
            dateFormats={{
                date: "DD/MM/YYYY",
                dateTime: "DD/MM/YYYY HH:mm",
                time: "HH:mm",
            }}
        >
            {children}
        </LocalizationProvider>
    );
};

export default PickerProvider;
