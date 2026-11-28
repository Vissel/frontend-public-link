# dev-fe

## Project Context
- **Frontend Stack**: ReactJS with MUI (Material-UI) components
- **Routing**: BrowserRouter with Tomcat deployment
- **API Pattern**: Axios-based with `pubApi` for public endpoints, `api` for admin endpoints
- **Context Path**: Configured via environment variables

---

## Table UI Patterns

### 1. UUID Display as Copy Button

**Rule**: Request UUIDs in tables must be displayed as a compact button showing the **last 4 characters**, not as a hyperlink or full text.

**Behavior**:
- Button displays `uuid.slice(-4)` (last 4 characters)
- On click, copies the **full UUID** to clipboard
- Shows "Copied!" feedback for 2 seconds after successful copy
- Event propagation is stopped to prevent interference with row-level actions

**Implementation**:
```jsx
<TableCell>
  {entry.requestUUID ? (
    <Button
      size="small"
      variant="outlined"
      onClick={(e) => {
        e.stopPropagation();
        handleCopyText(`uuid-${entry.requestUUID}`, entry.requestUUID);
      }}
      sx={{ minWidth: 60, fontSize: "0.7rem" }}
    >
      {copiedKey === `uuid-${entry.requestUUID}`
        ? "Copied!"
        : entry.requestUUID.slice(-4)}
    </Button>
  ) : (
    "\u2014"
  )}
</TableCell>
```

**Required State**:
```jsx
const [copiedKey, setCopiedKey] = useState("");
```

**Copy Handler**:
```jsx
const handleCopyText = (key, text) => {
  if (!text) return;
  const markCopied = () => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(markCopied)
      .catch(() => fallbackCopy(text, markCopied));
  } else {
    fallbackCopy(text, markCopied);
  }
};

const fallbackCopy = (text, onDone) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    onDone();
  } catch (e) {
    console.error("Copy failed", e);
  } finally {
    document.body.removeChild(textArea);
  }
};
```

---

### 2. Row-Level Navigation

**Rule**: Clicking anywhere on a table row navigates to the environment's public link. The row should have pointer cursor when clickable.

**Implementation**:
```jsx
<TableRow
  key={env.requestUUID || idx}
  hover
  onClick={() => {
    if (env.publicLink) {
      navigate(env.publicLink);
    }
  }}
  sx={{ cursor: env.publicLink ? "pointer" : "default" }}
>
  {/* cells */}
</TableRow>
```

---

### 3. Event Propagation for Interactive Cells

**Rule**: Cells containing interactive elements (buttons, links) must stop event propagation to prevent triggering row-level navigation.

**Pattern**:
```jsx
<TableCell
  onClick={(e) => {
    e.stopPropagation();
    // handle cell-specific action
  }}
>
  {/* interactive content */}
</TableCell>
```

**For MUI Link components**:
```jsx
<Link
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  underline="hover"
  onClick={(e) => e.stopPropagation()}
>
  Link Text
</Link>
```

---

### 4. Link Copy Button Pattern

**Rule**: Public links in tables should display as a "Link" hyperlink with an adjacent "Copy" button.

**Implementation**:
```jsx
<TableCell>
  {env.publicLink ? (
    <Stack direction="row" spacing={1} alignItems="center">
      <Link
        href={addHostToHref(env.publicLink)}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        title={`Open ${addHostToHref(env.publicLink)}`}
        onClick={(e) => e.stopPropagation()}
      >
        Link
      </Link>
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => {
          e.stopPropagation();
          handleCopyLink(`pub-${env.requestUUID || idx}`, env.publicLink);
        }}
        sx={{ minWidth: 60, fontSize: "0.7rem" }}
      >
        {copiedKey === `pub-${env.requestUUID || idx}` ? "Copied!" : "Copy"}
      </Button>
    </Stack>
  ) : (
    "\u2014"
  )}
</TableCell>
```

---

### 5. Status Chip Pattern

**Rule**: Status indicators use MUI Chip with color coding based on boolean state.

**Implementation**:
```jsx
<TableCell>
  <Chip
    label={env.envStatus ? "Active" : "Inactive"}
    size="small"
    color={env.envStatus ? "success" : "default"}
    onClick={() => {}}
    clickable={false}
  />
</TableCell>
```

**Note**: MUI v7 Chip requires explicit `onClick` handler to prevent undefined call errors.

---

## URL Helper Pattern

**Rule**: Relative links must be prefixed with `window.location.origin` for proper href resolution.

```jsx
const frontendOrigin = window.location.origin;

const addHostToHref = (link) => {
  if (!link) return "";
  return /^https?:\/\//i.test(link) ? link : `${frontendOrigin}${link}`;
};
```

---

## Empty Value Display

**Rule**: Use em-dash (`"\u2014"`) for empty/null values in table cells, not empty strings or "N/A".

---

## Streaming Download Pattern (Two-Step)

For large file exports, use a two-step streaming pattern to avoid memory issues and timeouts.

### Pattern Overview

1. **POST** export parameters → receive a single-use download token
2. **GET** stream endpoint with token → browser streams the file directly

### Implementation

```jsx
import { pubApi, config } from "../api";

const handleExportAll = async () => {
  try {
    // Step 1: Get download token
    const tokenResponse = await pubApi.post("/api/v1/seller/exportAllToken", {
      sellerName: username,
    });
    const downloadToken = tokenResponse.data?.downloadToken;
    if (!downloadToken) {
      console.error("No download token received");
      return;
    }

    // Step 2: Trigger streaming download via anchor click
    const streamUrl = `${config.baseURL}/publiclink/api/v1/seller/stream/exportAll/${downloadToken}`;
    
    const a = document.createElement("a");
    a.href = streamUrl;
    a.download = ""; // Let server determine filename from Content-Disposition
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("Export all failed", err);
  }
};
```

### Key Points

- **Token is single-use**: Backend removes it from cache after first retrieval
- **Native download handling**: Using anchor click lets browser handle download natively
- **Server determines filename**: Via `Content-Disposition` header
- **No blob buffering**: File streams directly from server to browser download manager
- **Import `config`**: Access `config.baseURL` for constructing the stream URL

### When to Use

- Large exports (>1000 rows or multiple sheets)
- Exports that may take >30 seconds
- When memory usage is a concern
- When you want native browser download UI

### When NOT to Use

- Small JSON downloads (<100 rows)
- When you need to process the response before saving
- When you need custom error handling on the download itself

---

## Date / Time Picker Format

**Rule**: every date and datetime input must use the **MUI X pickers** (`DatePicker`, `DateTimePicker` from `@mui/x-date-pickers`) and display **dd/mm/yyyy**. Native `<TextField type="date">` / `type="datetime-local"` are forbidden: their day/month order comes from the visitor's browser settings and cannot be overridden from the page (the `lang="en-GB"` pin did not work in all browsers and was removed).

### Setup (already in place)

- `src/components/PickerProvider.js` wraps the app in `index.js`; its `LocalizationProvider` uses `AdapterDayjs`, `dateFormats={{ date: "DD/MM/YYYY", dateTime: "DD/MM/YYYY HH:mm", time: "HH:mm" }}`, and `adapterLocale` from the i18n language (`vi` / `en`).
- Dependencies: `@mui/x-date-pickers@^7` (pinned to v7 so CRA/Jest keep resolving CommonJS) + `dayjs`.

### Field pattern

State stays the wire string; convert at the field boundary:

```jsx
// yyyy-MM-dd string state (date only)
<DatePicker
    label={t("...")}
    value={dateStr ? dayjs(dateStr) : null}
    onChange={(d) => setDate(d ? d.format("YYYY-MM-DD") : "")}
    slotProps={{ textField: { size: "small" } }}
/>

// yyyy-MM-ddTHH:mm string state (datetime), 24-hour, with an upper bound
<DateTimePicker
    label={t("...")}
    ampm={false}
    value={value ? dayjs(value) : null}
    onChange={(d) => setValue(d ? d.format("YYYY-MM-DDTHH:mm") : "")}
    maxDateTime={limit ? dayjs(toInputValue(limit)) : undefined}
    slotProps={{ textField: { fullWidth: true, size: "small" } }}
/>
```

### Key points

- Wire/backend formats stay `yyyy-MM-dd` / `yyyy-MM-ddTHH:mm`; only the display is DD/MM/YYYY — never change payload formats.
- `type="time"` TextFields may stay native (no date order involved).
- Tests rendering components with pickers must wrap them in `PickerProvider`, otherwise MUI X throws "Can not find the date and time pickers localization context" (see `YogaSection.test.js`).
- Converted sites: `SetupPage` (plan active date), `YogaSection` (range from/to, copy-target date), `BadmintonSection` (grid date), `SaleWindowEditDialog` + `SaleWindowFields` (sale window datetimes).
