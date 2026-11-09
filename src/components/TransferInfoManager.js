import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import api from "../api";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { loadVietnameseBanks } from "../util/vnBanks";

const contextPath = "/publiclink";
const TYPE_BANK = "BANK";
const TYPE_EWALLET = "EWALLET";
const TYPE_OTHER = "OTHER";

const emptyDraft = {
  type: TYPE_BANK,
  transferIssuer: "",
  issuerFullName: "",
  transferNumber: "",
  accountName: "",
  qrImage: "",
  defaultMessage: "",
  setDefault: false,
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });

/**
 * Transfer info list + create form, shared by the admin and the seller setup
 * pages. The backend resolves the owner from the caller token, so the very
 * same component and endpoints serve both roles. Each row collapses/expands.
 */
const TransferInfoManager = () => {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [expandedCode, setExpandedCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const typeOptions = useMemo(
    () => [
      { value: TYPE_BANK, label: t("transferInfo.types.bank") },
      { value: TYPE_EWALLET, label: t("transferInfo.types.ewallet") },
      { value: TYPE_OTHER, label: t("transferInfo.types.other") },
    ],
    [t]
  );

  const bankOptions = useMemo(
    () =>
      banks
        .filter((bank) => (draft.type === TYPE_BANK ? bank.category !== "EWALLET" : true))
        .sort((a, b) => (a.shortName || "").localeCompare(b.shortName || "")),
    [banks, draft.type]
  );

  const logoByIssuer = useMemo(() => {
    const map = {};
    banks.forEach((bank) => {
      if (bank.shortName) {
        map[bank.shortName.toLowerCase()] = bank.logo;
      }
    });
    return map;
  }, [banks]);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`${contextPath}/api/v1/transferInfo/list`);
      setItems(res.data?.items || []);
    } catch (err) {
      console.error("Failed to load transfer info list", err);
      setError(t("transferInfo.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadList();
    loadVietnameseBanks()
      .then(setBanks)
      .catch((err) => console.error("Failed to load bank directory", err));
  }, [loadList]);

  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleBankSelect = (_event, option) => {
    setDraft((prev) => ({
      ...prev,
      transferIssuer: option?.shortName || "",
      issuerFullName: option?.fullName || "",
    }));
  };

  const handleQrUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUri = await readFileAsBase64(file);
      handleDraftChange("qrImage", dataUri);
    } catch (err) {
      setError(t("transferInfo.errors.qrRead"));
    }
  };

  const handleCreate = async () => {
    setError("");
    setSuccess("");

    if (!draft.transferIssuer.trim() || !draft.transferNumber.trim()) {
      setError(t("transferInfo.errors.requiredFields"));
      return;
    }

    try {
      setSaving(true);
      await api.post(`${contextPath}/api/v1/transferInfo/create`, {
        ...draft,
        transferIssuer: draft.transferIssuer.trim(),
        transferNumber: draft.transferNumber.trim(),
        // labeling only; the server owns the row by the authenticated caller
        ownerHint: userRole || "",
      });
      setSuccess(t("transferInfo.success.created"));
      setDraft(emptyDraft);
      setShowForm(false);
      await loadList();
    } catch (err) {
      console.error("Failed to create transfer info", err);
      setError(err?.response?.data?.errorMessage || t("transferInfo.errors.create"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (transferCode) => {
    try {
      await api.post(`${contextPath}/api/v1/transferInfo/setDefault`, { transferCode });
      await loadList();
    } catch (err) {
      console.error("Failed to set default transfer info", err);
      setError(err?.response?.data?.errorMessage || t("transferInfo.errors.setDefault"));
    }
  };

  const handleRemove = async (transferCode) => {
    try {
      await api.post(`${contextPath}/api/v1/transferInfo/remove`, { transferCode });
      await loadList();
    } catch (err) {
      console.error("Failed to remove transfer info", err);
      setError(err?.response?.data?.errorMessage || t("transferInfo.errors.remove"));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Stack direction="row" justifyContent="flex-end">
        <Button
          size="small"
          variant={showForm ? "outlined" : "contained"}
          onClick={() => setShowForm((prev) => !prev)}
        >
          {showForm ? t("transferInfo.action.hideForm") : t("transferInfo.action.add")}
        </Button>
      </Stack>

      {showForm && (
        <Stack
          spacing={2}
          sx={{ p: 2, border: "1px solid", borderRadius: 2, borderColor: "divider" }}
        >
          <TextField
            select
            size="small"
            label={t("transferInfo.field.type")}
            value={draft.type}
            onChange={(event) => handleDraftChange("type", event.target.value)}
          >
            {typeOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          {draft.type === TYPE_BANK ? (
            <Autocomplete
              options={bankOptions}
              getOptionLabel={(option) =>
                option?.shortName ? `${option.shortName} — ${option.fullName || ""}` : ""
              }
              isOptionEqualToValue={(option, value) => option?.code === value?.code}
              onChange={handleBankSelect}
              value={bankOptions.find((bank) => bank.shortName === draft.transferIssuer) || null}
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ gap: 1, alignItems: "center" }}>
                  <Box
                    component="img"
                    src={option.logo}
                    alt=""
                    sx={{ width: 24, height: 24, objectFit: "contain" }}
                  />
                  <Stack>
                    <Typography variant="body2">{option.shortName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.fullName}
                    </Typography>
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} size="small" label={t("transferInfo.field.bank")} />
              )}
            />
          ) : (
            <TextField
              size="small"
              label={t("transferInfo.field.issuer")}
              value={draft.transferIssuer}
              onChange={(event) => handleDraftChange("transferIssuer", event.target.value)}
            />
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              label={t("transferInfo.field.number")}
              value={draft.transferNumber}
              onChange={(event) => handleDraftChange("transferNumber", event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label={t("transferInfo.field.accountName")}
              value={draft.accountName}
              onChange={(event) => handleDraftChange("accountName", event.target.value)}
              fullWidth
            />
          </Stack>

          <TextField
            size="small"
            multiline
            minRows={2}
            label={t("transferInfo.field.defaultMessage")}
            helperText={t("transferInfo.field.defaultMessageHint")}
            value={draft.defaultMessage}
            onChange={(event) => handleDraftChange("defaultMessage", event.target.value)}
          />

          <Box>
            <Button size="small" variant="outlined" component="label">
              {draft.qrImage
                ? t("transferInfo.action.changeQr")
                : t("transferInfo.action.uploadQr")}
              <input hidden type="file" accept="image/*" onChange={handleQrUpload} />
            </Button>
          </Box>
          {draft.qrImage && (
            <Box
              component="img"
              src={draft.qrImage}
              alt="qr preview"
              sx={{
                width: 120,
                height: 120,
                objectFit: "contain",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
              }}
            />
          )}

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={draft.setDefault}
                onChange={(event) => handleDraftChange("setDefault", event.target.checked)}
              />
            }
            label={t("transferInfo.action.markDefault")}
          />

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={() => setShowForm(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button size="small" variant="contained" onClick={handleCreate} disabled={saving}>
              {t("common.save")}
            </Button>
          </Stack>
        </Stack>
      )}

      <Divider />

      {loading && <Typography color="text.secondary">{t("common.loading")}</Typography>}
      {!loading && items.length === 0 && (
        <Typography color="text.secondary">{t("transferInfo.empty")}</Typography>
      )}

      {items.map((item) => {
        const isExpanded = expandedCode === item.transferCode;
        const logo = logoByIssuer[(item.transferIssuer || "").toLowerCase()];
        return (
          <Box
            key={item.transferCode}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              onClick={() => setExpandedCode(isExpanded ? null : item.transferCode)}
              sx={{ px: 2, py: 1.5, cursor: "pointer" }}
            >
              {logo ? (
                <Box
                  component="img"
                  src={logo}
                  alt=""
                  sx={{ width: 24, height: 24, objectFit: "contain" }}
                />
              ) : null}
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {item.transferIssuer}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {item.transferNumber}
              </Typography>
              {item.isDefault && (
                <Chip size="small" color="primary" label={t("transferInfo.chip.default")} />
              )}
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {isExpanded
                  ? t("transferInfo.action.collapse")
                  : t("transferInfo.action.expand")}
              </Typography>
            </Stack>

            {isExpanded && (
              <Stack spacing={1.5} sx={{ px: 2, pb: 2 }}>
                {item.issuerFullName && (
                  <Typography variant="body2" color="text.secondary">
                    {item.issuerFullName}
                  </Typography>
                )}
                <Typography variant="body2">
                  {t("transferInfo.field.accountName")}: {item.accountName || "-"}
                </Typography>
                {item.defaultMessage && (
                  <Typography variant="body2">{item.defaultMessage}</Typography>
                )}
                {item.qrImage && (
                  <Box
                    component="img"
                    src={item.qrImage}
                    alt="transfer qr"
                    sx={{ width: 160, height: 160, objectFit: "contain" }}
                  />
                )}
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={item.isDefault}
                    onClick={() => handleSetDefault(item.transferCode)}
                  >
                    {t("transferInfo.action.setDefault")}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="text"
                    onClick={() => handleRemove(item.transferCode)}
                  >
                    {t("transferInfo.action.remove")}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

export default TransferInfoManager;
