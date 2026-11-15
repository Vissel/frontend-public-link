/**
 * Clipboard helper shared by the payment screens.
 *
 * `navigator.clipboard` needs a secure context and can still reject (permissions
 * policy, embedded webview), so the legacy textarea path stays as the fallback
 * and `onCopied` runs either way: the caller shows a "Copied!" label and must
 * not be left spinning when the modern API refuses.
 */
export const copyText = (text, onCopied) => {
    if (!text) {
        return;
    }

    const markCopied = () => {
        if (typeof onCopied === "function") {
            onCopied();
        }
    };

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(markCopied).catch(() => fallbackCopy(text, markCopied));
        return;
    }

    fallbackCopy(text, markCopied);
};

const fallbackCopy = (text, onCopied) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand("copy");
    } catch (err) {
        console.error("Copy failed", err);
    } finally {
        document.body.removeChild(textArea);
        onCopied();
    }
};

/**
 * The DTO field is `isDefault`, but its boolean getter makes Jackson serialize
 * the flag as `default`. Accept both so the default account keeps its highlight.
 */
export const isDefaultTransfer = (transfer) =>
    Boolean(transfer?.isDefault ?? transfer?.default);

/** Whole-VND formatting shared by the plan and payment screens. */
export const formatVND = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return num.toLocaleString("en-US");
};
