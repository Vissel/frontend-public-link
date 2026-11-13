import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import api from "../api";
import { AVATAR_PIXELS, initialsOf, resizeToDataUrl } from "../util/avatar";

/**
 * Pick, preview and store the signed-in account's picture.
 *
 * Resizing happens here in the browser (see util/avatar.js): the server only ever
 * receives a 256x256 JPEG, so the request is small and the stored row is
 * predictable. Saving an empty picture is how the avatar is deleted.
 */
const AvatarDialog = ({ open, onClose, username, dataUrl, onChanged }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(dataUrl || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPreview(dataUrl || "");
      setError("");
      setBusy(false);
    }
  }, [open, dataUrl]);

  const handlePick = async (event) => {
    const file = event.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    event.target.value = "";
    if (!file) return;
    try {
      setPreview(await resizeToDataUrl(file, AVATAR_PIXELS));
      setError("");
    } catch {
      setError(t("avatarDialog.errors.notAnImage"));
    }
  };

  const submit = async (payloadDataUrl) => {
    setBusy(true);
    setError("");
    try {
      const response = await api.put("/api/v1/user/avatar", { dataUrl: payloadDataUrl });
      onChanged?.(response.data?.data?.dataUrl || null);
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.errorMessage ||
          err?.response?.data?.message ||
          t("avatarDialog.errors.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("avatarDialog.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center" sx={{ pt: 1 }}>
          <Avatar
            src={preview || undefined}
            alt={username}
            sx={{
              width: 128,
              height: 128,
              fontSize: 44,
              bgcolor: preview ? "transparent" : "primary.main",
            }}
          >
            {initialsOf(username)}
          </Avatar>
          <Typography variant="caption" color="text.secondary" align="center">
            {t("avatarDialog.hint", { size: AVATAR_PIXELS })}
          </Typography>
          <Box sx={{ display: "none" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePick}
            />
          </Box>
          <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()}>
            {t("avatarDialog.choose")}
          </Button>
          {error ? <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {preview ? (
            <Button color="error" onClick={() => submit("")} disabled={busy}>
              {t("avatarDialog.remove")}
            </Button>
          ) : null}
        </Stack>
        <Button variant="contained" onClick={() => submit(preview)} disabled={busy || !preview}>
          {t("avatarDialog.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AvatarDialog;
