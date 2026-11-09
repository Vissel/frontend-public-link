# Frontend Development Notes (dev-fe)

## Quick Reference: Adding i18n to New/Updated Code

### New Component
```jsx
import { useTranslation } from "react-i18next";

const MyPage = () => {
  const { t } = useTranslation();
  return <Typography>{t("myPage.title")}</Typography>;
};
```

### Update Existing Component
- If `useTranslation` is already imported, just add `t("key")` calls
- If not, add the import + `const { t } = useTranslation()`

### Key Naming
| Pattern | Example | Use For |
|---|---|---|
| `namespace.key` | `sellerHome.title` | Labels |
| `namespace.errors.key` | `sellerHome.errors.loadFailed` | Errors |
| `namespace.success.key` | `publink.success.orderPlaced` | Success |
| `common.key` | `common.loading` | Shared |

### Interpolation
```jsx
t("notification.success.sent", { count: 5 })
// JSON: "sent": "Sent to {{count}} successfully."
```

### Must-Do
1. Add key to **both** `src/i18n/locales/en/translation.json` and `vi/translation.json`
2. Run `npm run build` to verify

### Translation File Paths
- English: `src/i18n/locales/en/translation.json`
- Vietnamese: `src/i18n/locales/vi/translation.json`
- Config: `src/i18n/index.js`

### Existing Namespaces
`common`, `header`, `footer`, `login`, `register`, `saleUrl`, `redirect`,
`adminHome`, `sellerForm`, `productForm`, `generation`, `environmentDetail`,
`sellerHome`, `publink`, `notification`, `notificationBell`, `countdown`,
`error`, `publish`

---

## Table UI Quick Reference

### UUID Copy Button
- Display `uuid.slice(-4)`, copy full UUID on click
- Stop event propagation: `e.stopPropagation()`

### Row Navigation
- `onClick` on `<TableRow>` with `cursor: "pointer"`

### Event Propagation
- All interactive cells must `e.stopPropagation()`

### Link Copy Pattern
- `<Link>` + `<Button>` (Copy) side by side

### Status Chip
- `<Chip label={active ? "Active" : "Inactive"} color={active ? "success" : "default"} onClick={() => {}} clickable={false} />`
- MUI v7: always provide `onClick` handler

### URL Helper
```jsx
const addHostToHref = (link) =>
  /^https?:\/\//i.test(link) ? link : `${window.location.origin}${link}`;
```

### Empty Values
- Use em-dash `"\u2014"` — not empty string or "N/A"
