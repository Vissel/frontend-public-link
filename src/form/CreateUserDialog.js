import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import api from "../api";
import { copyText } from "../util/clipboard";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Admin creates a seller or buyer account. No password is typed here: the
 * account service generates one that is never returned, and the result view
 * hands the admin a single-use setup link to forward (it is also emailed when
 * an address was given). The new user sets their own password on that link.
 *
 * Admin accounts cannot be created from this dialog - only SELLER and BUYER.
 */
const CreateUserDialog = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ username: "", name: "", email: "", role: "SELLER" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ username: "", name: "", email: "", role: "SELLER" });
      setFieldErrors({});
      setError("");
      setResult(null);
      setCopied(false);
    }
  }, [open]);

  const update = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validate = () => {
    const next = {};
    if (!USERNAME_PATTERN.test(form.username.trim())) {
      next.username = t("adminHome.createUser.errors.usernamePattern");
    }
    if (!form.name.trim()) {
      next.name = t("adminHome.createUser.errors.nameRequired");
    }
    const email = form.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      next.email = t("adminHome.createUser.errors.emailInvalid");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setError("");
    if (!validate()) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`${contextPath}/admin/v1/user/create`, {
        username: form.username.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setResult(res.data || null);
      if (onSuccess) {
        onSuccess(res.data);
      }
    } catch (err) {
      console.error("Create user failed", err);
      setError(mapError(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * The endpoint answers with a status and an empty body on refusal (the
   * service template puts the reason in errorMessage only when it has one), so
   * the status carries the meaning here.
   */
  const mapError = (err) => {
    const body = err?.response?.data;
    if (body?.errorMessage) return body.errorMessage;
    if (body?.message) return body.message;

    const status = err?.response?.status;
    if (status === 409) return t("adminHome.createUser.errors.usernameTaken");
    if (status === 400) return t("adminHome.createUser.errors.invalidInput");
    if (status === 502 || status === 503 || status === 504) {
      return t("adminHome.createUser.errors.accountServiceDown");
    }
    if (!err?.response) return t("adminHome.createUser.errors.noResponse");
    return t("adminHome.createUser.errors.failed");
  };

  const handleCopyLink = () => {
    copyText(result?.setupLink, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {result ? t("adminHome.createUser.resultTitle") : t("adminHome.createUser.title")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {result ? (
            <>
              <Alert severity="success">
                {t("adminHome.createUser.success", {
                  username: result.username || "",
                  role: result.role || "",
                })}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {t("adminHome.createUser.linkHint")}
              </Typography>
              <TextField
                label={t("adminHome.setupLink")}
                value={result.setupLink || ""}
                fullWidth
                multiline
                rows={2}
                InputProps={{ readOnly: true }}
              />
              <Button variant="outlined" onClick={handleCopyLink} sx={{ alignSelf: "flex-start" }}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
              {!result.email && (
                <Typography variant="caption" color="text.secondary">
                  {t("adminHome.createUser.noEmailNote")}
                </Typography>
              )}
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {t("adminHome.createUser.subtitle")}
              </Typography>
              <TextField
                label={t("adminHome.username")}
                value={form.username}
                onChange={update("username")}
                error={Boolean(fieldErrors.username)}
                helperText={fieldErrors.username || t("adminHome.createUser.usernameHint")}
                required
                fullWidth
                size="small"
                disabled={submitting}
              />
              <TextField
                label={t("adminHome.name")}
                value={form.name}
                onChange={update("name")}
                error={Boolean(fieldErrors.name)}
                helperText={fieldErrors.name || ""}
                required
                fullWidth
                size="small"
                disabled={submitting}
              />
              <TextField
                label={t("adminHome.email")}
                type="email"
                value={form.email}
                onChange={update("email")}
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email || t("adminHome.createUser.emailHint")}
                fullWidth
                size="small"
                disabled={submitting}
              />
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {t("adminHome.role")}
                </Typography>
                <ToggleButtonGroup
                  value={form.role}
                  exclusive
                  onChange={(_, value) => {
                    if (value) {
                      setForm((prev) => ({ ...prev, role: value }));
                    }
                  }}
                  size="small"
                  disabled={submitting}
                >
                  <ToggleButton value="SELLER">{t("adminHome.createUser.roleSeller")}</ToggleButton>
                  <ToggleButton value="BUYER">{t("adminHome.createUser.roleBuyer")}</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  {form.role === "SELLER"
                    ? t("adminHome.createUser.roleSellerHint")
                    : t("adminHome.createUser.roleBuyerHint")}
                </Typography>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {result ? t("common.done") : t("common.cancel")}
        </Button>
        {!result && (
          <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
            {submitting ? t("adminHome.createUser.submitting") : t("adminHome.createUser.submit")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CreateUserDialog;
