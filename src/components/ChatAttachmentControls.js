import React, { useRef } from "react";
import { Box, IconButton, Stack, SvgIcon, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { CHAT_ATTACHMENT_ACCEPT, formatChatBytes } from "../util/useChatAttachmentDraft";

const AttachSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
    </SvgIcon>
);

const FileSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </SvgIcon>
);

const CloseSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </SvgIcon>
);

/**
 * Paperclip of a chat composer: opens the file picker limited to the types
 * the chat accepts (images plus standard documents). Clipboard images arrive
 * through the TextField's onPaste, wired to the same draft controller.
 */
export const ChatAttachmentPicker = ({ controller, disabled }) => {
    const { t } = useTranslation();
    const inputRef = useRef(null);

    return (
        <>
            <Tooltip title={t("chat.attachment.add")}>
                <span>
                    <IconButton
                        size="small"
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                    >
                        <AttachSvgIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Box
                component="input"
                type="file"
                ref={inputRef}
                accept={CHAT_ATTACHMENT_ACCEPT}
                sx={{ display: "none" }}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        controller.addFile(file);
                    }
                    // Same file picked twice in a row must still fire change.
                    event.target.value = "";
                }}
            />
        </>
    );
};

/** Staged attachment (thumbnail or file row) plus validation feedback. */
export const ChatAttachmentDraftRow = ({ controller }) => {
    const { t } = useTranslation();
    const { draft, error, clear } = controller;
    if (!draft && !error) {
        return null;
    }
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, pb: 0.5, minWidth: 0 }}>
            {error ? (
                <Typography variant="caption" color="error.main" sx={{ flex: 1, minWidth: 0 }}>
                    {error}
                </Typography>
            ) : null}
            {draft ? (
                <>
                    {draft.previewUrl ? (
                        <Box
                            component="img"
                            src={draft.previewUrl}
                            alt={draft.fileName}
                            sx={{ width: 36, height: 36, objectFit: "cover", borderRadius: 1, flexShrink: 0 }}
                        />
                    ) : (
                        <FileSvgIcon fontSize="small" />
                    )}
                    <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
                        {draft.fileName} · {formatChatBytes(draft.sizeBytes)}
                    </Typography>
                    <Tooltip title={t("chat.attachment.remove")}>
                        <IconButton size="small" onClick={clear}>
                            <CloseSvgIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </>
            ) : null}
        </Stack>
    );
};
