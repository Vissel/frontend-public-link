import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Staged attachment of a chat composer: one image or one document picked from
 * disk or pasted from the clipboard, validated client-side before upload.
 *
 * The limits mirror the server policy (ChatAttachmentDomain): images up to
 * 5 MB, documents up to 10 MB, and only the allow-listed types - the server
 * re-checks everything, this only keeps honest mistakes off the wire.
 */

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const CHAT_ATTACHMENT_ACCEPT =
    "image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const ALLOWED_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "webp", "gif",
    "pdf", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

export const isChatImageFile = (file) => IMAGE_TYPES.has(file?.type);

export const formatChatBytes = (size) => {
    const bytes = Number(size || 0);
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    return `${bytes} B`;
};

const formatLimit = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

export const validateChatFile = (file, t) => {
    if (!file) {
        return t("chat.errors.sendFailed");
    }
    const name = file.name || "";
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const image = IMAGE_TYPES.has(file.type);
    if (!image && !ALLOWED_EXTENSIONS.has(extension)) {
        return t("chat.errors.fileTypeNotAllowed");
    }
    const limit = image ? CHAT_IMAGE_MAX_BYTES : CHAT_FILE_MAX_BYTES;
    if (file.size > limit) {
        return t("chat.errors.fileTooLarge", { limit: formatLimit(limit) });
    }
    return "";
};

export const useChatAttachmentDraft = () => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState("");
    const draftRef = useRef(null);

    const publish = useCallback((next) => {
        draftRef.current = next;
        setDraft(next);
    }, []);

    const addFile = useCallback(
        (file) => {
            const problem = validateChatFile(file, t);
            if (problem) {
                setError(problem);
                return false;
            }
            const image = isChatImageFile(file);
            publish({
                file,
                kind: image ? "IMAGE" : "FILE",
                fileName: file.name || (image ? "image.png" : "file"),
                sizeBytes: file.size,
                // Local thumbnail for the staged draft and the optimistic bubble.
                previewUrl: image ? URL.createObjectURL(file) : "",
            });
            setError("");
            return true;
        },
        [publish, t],
    );

    const release = useCallback((staged) => {
        if (staged?.previewUrl) {
            URL.revokeObjectURL(staged.previewUrl);
        }
    }, []);

    const clear = useCallback(() => {
        release(draftRef.current);
        publish(null);
        setError("");
    }, [publish, release]);

    /**
     * Hands the staged file to the sender without revoking its preview: the
     * optimistic bubble keeps showing the local image until the server frame
     * with the stored attachment replaces it.
     */
    const take = useCallback(() => {
        const current = draftRef.current;
        publish(null);
        setError("");
        return current;
    }, [publish]);

    /** Clipboard images paste straight into the composer as an attachment. */
    const pickFromClipboard = useCallback(
        (event) => {
            const items = event?.clipboardData?.items;
            if (!items) {
                return false;
            }
            for (let i = 0; i < items.length; i += 1) {
                const item = items[i];
                if (item.kind === "file" && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        event.preventDefault();
                        return addFile(file);
                    }
                }
            }
            return false;
        },
        [addFile],
    );

    return { draft, error, addFile, clear, take, pickFromClipboard };
};
