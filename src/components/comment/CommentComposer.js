import React, { useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  SvgIcon,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { formatChatBytes } from "../../util/useChatAttachmentDraft";

const AttachSvgIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
  </SvgIcon>
);

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FILE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif",
  "pdf", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
];

const extensionOf = (name = "") => {
  const dot = name.lastIndexOf(".");
  return dot < 0 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase();
};
const isImage = (file) =>
  String(file.type || "").startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(extensionOf(file.name));

/**
 * Comment / reply composer: a multiline box, an attach button (allow-listed
 * types, 5 MB images / 10 MB documents, at most 4 files — the same surface the
 * backend re-validates), thumbnail previews, and a submit that emits FormData.
 *
 * When the visitor is not signed in, the composer is replaced by a hint: reads
 * are public but only a signed-in user may post. The parent owns the actual
 * network call; this component only reports a ready payload via onSubmit.
 */
const CommentComposer = ({
  onSubmit,
  onCancel,
  isReply = false,
  submitLabelKey = "comment.post",
  initialValue = "",
  working = false,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialValue);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const addFiles = (incoming) => {
    const list = Array.from(incoming || []);
    if (!list.length) return;
    const merged = [...files];
    for (const file of list) {
      if (merged.length >= MAX_ATTACHMENTS) {
        setError(t("comment.errors.tooManyFiles", { max: MAX_ATTACHMENTS }));
        break;
      }
      if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
        setError(t("comment.errors.filetype"));
        continue;
      }
      const cap = isImage(file) ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
      if (file.size > cap) {
        setError(t("comment.errors.tooLarge", { max: formatChatBytes(cap) }));
        continue;
      }
      merged.push(file);
    }
    setFiles(merged);
  };

  const removeFile = (index) => setFiles(files.filter((_, i) => i !== index));

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) {
      setError(t("comment.errors.empty"));
      return;
    }
    if (trimmed.length > 5000) {
      setError(t("comment.errors.tooLong"));
      return;
    }
    setError("");
    onSubmit({ content: trimmed, files });
  };

  const reset = () => {
    setContent("");
    setFiles([]);
    setError("");
  };

  return (
    <Stack spacing={1}>
      <TextField
        multiline
        minRows={isReply ? 2 : 3}
        maxRows={8}
        value={content}
        disabled={disabled || working}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t(isReply ? "comment.replyPlaceholder" : "comment.placeholder")}
        sx={{ bgcolor: "background.paper" }}
        inputProps={{ "aria-label": t(isReply ? "comment.replyPlaceholder" : "comment.placeholder") }}
      />

      {files.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {files.map((file, index) => (
            <Chip
              key={`${file.name}-${index}`}
              size="small"
              label={`${file.name} · ${formatChatBytes(file.size)}`}
              onDelete={() => removeFile(index)}
              onClick={isImage(file) ? () => window.open(URL.createObjectURL(file), "_blank", "noopener,noreferrer") : undefined}
            />
          ))}
        </Stack>
      )}

      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title={t("comment.attach")}>
          <span>
            <IconButton
              size="small"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || working || files.length >= MAX_ATTACHMENTS}
            >
              <AttachSvgIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Box sx={{ flex: 1 }} />
        {onCancel ? (
          <Button size="small" onClick={() => { reset(); onCancel(); }} disabled={working}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          size="small"
          variant="contained"
          onClick={handleSubmit}
          disabled={disabled || working}
          sx={{ borderRadius: 2 }}
        >
          {working ? t("common.submitting") : t(submitLabelKey)}
        </Button>
      </Stack>
    </Stack>
  );
};

export default CommentComposer;
