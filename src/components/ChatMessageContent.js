import React, { useEffect, useState } from "react";
import { Box, IconButton, Stack, SvgIcon, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { formatChatBytes } from "../util/useChatAttachmentDraft";
import { renderChatRichText } from "../util/chatRichText";

const DownloadSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
    </SvgIcon>
);

const FileSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </SvgIcon>
);

/**
 * Loads the stored bytes of one attachment through the authenticated API and
 * hands out an object URL. A plain <img src> cannot work: the credential for
 * the download endpoint travels in request headers (device id or JWT).
 */
const useAttachmentUrl = (attachment, fetchAttachment) => {
    const [url, setUrl] = useState(attachment?.previewUrl || "");

    useEffect(() => {
        if (!attachment || attachment.previewUrl || !attachment.uuid || !fetchAttachment) {
            return undefined;
        }
        let objectUrl = "";
        let cancelled = false;
        fetchAttachment(attachment.uuid)
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch(() => {
                /* the row still shows name and size without the bytes */
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [attachment, fetchAttachment]);

    return url;
};

/**
 * Body of one chat bubble: the message text with links and the markdown
 * subset rendered, plus the image thumbnail or document row of its
 * attachment, each with a download affordance.
 */
const ChatMessageContent = ({ message, fetchAttachment }) => {
    const { t } = useTranslation();
    const attachment = message?.attachment || null;
    const url = useAttachmentUrl(attachment, fetchAttachment);

    // A file sent without a caption stores "[Image] name" as its content so
    // Zalo shows something meaningful; the bubble must not repeat it.
    const isPlaceholder =
        attachment &&
        (message.content === `[Image] ${attachment.fileName}` ||
            message.content === `[File] ${attachment.fileName}`);

    return (
        <Stack spacing={0.75} sx={{ minWidth: 0, width: "100%" }}>
            {attachment?.kind === "IMAGE" && url ? (
                <Box
                    component="img"
                    src={url}
                    alt={attachment.fileName}
                    title={attachment.fileName}
                    onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                    sx={{
                        display: "block",
                        width: "100%",
                        maxHeight: 220,
                        objectFit: "contain",
                        borderRadius: 1,
                        cursor: "pointer",
                        bgcolor: "rgba(255,255,255,0.4)",
                    }}
                />
            ) : null}
            {attachment?.kind === "FILE" ? (
                <Stack direction="row" spacing={1} alignItems="center">
                    <FileSvgIcon fontSize="small" />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" sx={{ display: "block", wordBreak: "break-all" }}>
                            {attachment.fileName}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.75 }}>
                            {formatChatBytes(attachment.sizeBytes)}
                        </Typography>
                    </Box>
                </Stack>
            ) : null}
            {!isPlaceholder && message.content ? (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {renderChatRichText(message.content)}
                </Typography>
            ) : null}
            {attachment ? (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ justifyContent: "flex-end" }}>
                    {attachment.kind === "IMAGE" ? (
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.8, flex: 1, textAlign: "left", wordBreak: "break-all" }}
                        >
                            {attachment.fileName} · {formatChatBytes(attachment.sizeBytes)}
                        </Typography>
                    ) : (
                        <Box sx={{ flex: 1 }} />
                    )}
                    <Tooltip title={t("chat.attachment.download")}>
                        <span>
                            <IconButton
                                size="small"
                                component="a"
                                href={url || undefined}
                                download={attachment.fileName}
                                disabled={!url}
                                onClick={(event) => event.stopPropagation()}
                                sx={{ color: "inherit" }}
                            >
                                <DownloadSvgIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            ) : null}
        </Stack>
    );
};

export default ChatMessageContent;
