import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { pubApi } from "../api";
import { useTranslation } from "react-i18next";

const SELLER = "/api/v1/yoga/seller";

const formatVND = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("en-US") : "-";
};

/**
 * Seller yoga payment plans. Pick one of the seller's yoga environments, then
 * create / top up / deactivate the buyer plans linked to it. Creating a plan
 * provisions the buyer account and returns the single-use setup link, which
 * is shown copyable here and also emailed when the buyer has an address.
 */
const YogaPlansManager = () => {
  const { t } = useTranslation();
  const [envs, setEnvs] = useState([]);
  const [token, setToken] = useState("");
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    pubApi
      .get(`${SELLER}/environments`)
      .then((res) => {
        const items = res.data || [];
        setEnvs(items);
        if (items.length > 0) setToken(items[0].publicLink);
      })
      .catch((err) => {
        console.error("Load yoga environments failed", err);
        setError(t("yogaPlans.errors.loadEnvs"));
      });
  }, [t]);

  const loadPlans = React.useCallback(async () => {
    if (!token) {
      setPlans([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await pubApi.get(`${SELLER}/plan/list`, { params: { token } });
      setPlans(res.data || []);
    } catch (err) {
      console.error("Load plans failed", err);
      setError(err?.response?.data?.errorMessage || t("yogaPlans.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openCreate = () => {
    setDraft({ sellerPlanCode: "", buyerName: "", buyerEmail: "", totalDays: 1, amountVnd: "" });
    setDialogOpen(true);
  };

  const openEdit = (plan) => {
    setDraft({
      sellerPlanCode: plan.sellerPlanCode,
      buyerName: plan.buyerName,
      buyerEmail: plan.buyerEmail || "",
      totalDays: plan.totalDays,
      amountVnd: plan.amountVnd,
      state: plan.state,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft.buyerName.trim()) {
      setError(t("yogaPlans.errors.buyerRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const isCreate = !draft.sellerPlanCode;
      const payload = {
        token,
        buyerName: draft.buyerName.trim(),
        buyerEmail: draft.buyerEmail.trim(),
        totalDays: Number(draft.totalDays),
        amountVnd: Number(draft.amountVnd || 0),
      };
      if (isCreate) {
        const res = await pubApi.post(`${SELLER}/plan/create`, payload);
        const link = res.data?.data?.setupLink;
        setNotice(link ? t("yogaPlans.success.createdWithLink") : t("yogaPlans.success.created"));
      } else {
        await pubApi.post(`${SELLER}/plan/update`, {
          ...payload,
          sellerPlanCode: draft.sellerPlanCode,
          state: draft.state,
        });
        setNotice(t("yogaPlans.success.updated"));
      }
      setDialogOpen(false);
      await loadPlans();
    } catch (err) {
      console.error("Save plan failed", err);
      setError(err?.response?.data?.errorMessage || t("yogaPlans.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (plan) => {
    setError("");
    try {
      await pubApi.post(`${SELLER}/plan/resend`, null, {
        params: { token, sellerPlanCode: plan.sellerPlanCode },
      });
      setNotice(t("yogaPlans.success.linkSent"));
      await loadPlans();
    } catch (err) {
      console.error("Resend failed", err);
      setError(err?.response?.data?.errorMessage || t("yogaPlans.errors.resend"));
    }
  };

  const copyText = (key, text) => {
    if (!text) return;
    const mark = () => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(mark).catch(() => {});
    }
  };

  if (envs.length === 0) {
    return (
      <Alert severity="info">{t("yogaPlans.noEnvironments")}</Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
        <TextField
          select
          size="small"
          label={t("yogaPlans.environment")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          sx={{ minWidth: 260 }}
        >
          {envs.map((env) => (
            <MenuItem key={env.envId} value={env.publicLink}>
              {env.productName || env.requestUUID?.slice(0, 8)}
            </MenuItem>
          ))}
        </TextField>
        <Button size="small" variant="contained" onClick={openCreate} disabled={!token}>
          {t("yogaPlans.newPlan")}
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {t("setup.total")} {plans.length}
        </Typography>
      </Stack>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("yogaPlans.buyer")}</TableCell>
              <TableCell>{t("yogaPlans.username")}</TableCell>
              <TableCell>{t("yogaPlans.email")}</TableCell>
              <TableCell align="center">{t("yogaPlans.days")}</TableCell>
              <TableCell align="right">{t("yogaPlans.amount")}</TableCell>
              <TableCell>{t("yogaPlans.password")}</TableCell>
              <TableCell>{t("setup.column.state")}</TableCell>
              <TableCell align="right">{t("setup.column.action")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    {loading ? t("common.loading") : t("yogaPlans.empty")}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {plans.map((plan) => (
              <TableRow key={plan.sellerPlanCode} hover>
                <TableCell>{plan.buyerName}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{plan.buyerUsername}</Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => copyText(`u-${plan.sellerPlanCode}`, plan.buyerUsername)}
                    >
                      {copiedKey === `u-${plan.sellerPlanCode}` ? t("common.copied") : t("common.copy")}
                    </Button>
                  </Stack>
                </TableCell>
                <TableCell>{plan.buyerEmail || "—"}</TableCell>
                <TableCell align="center">{plan.usedDays}/{plan.totalDays}</TableCell>
                <TableCell align="right">{formatVND(plan.amountVnd)} VND</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={plan.passwordSet ? "success" : "warning"}
                    label={plan.passwordSet ? t("yogaPlans.setPassword") : t("yogaPlans.notSetPassword")}
                  />
                </TableCell>
                <TableCell>
                  <Chip size="small" color={plan.state === "ACTIVE" ? "success" : "default"} label={plan.state} />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => openEdit(plan)}>{t("yogaPlans.edit")}</Button>
                    <Button size="small" onClick={() => handleResend(plan)}>{t("yogaPlans.resend")}</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={saving ? undefined : () => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {draft?.sellerPlanCode ? t("yogaPlans.editTitle") : t("yogaPlans.createTitle")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("yogaPlans.buyer")}
              value={draft?.buyerName || ""}
              onChange={(e) => setDraft((p) => ({ ...p, buyerName: e.target.value }))}
              disabled={Boolean(draft?.sellerPlanCode)}
              fullWidth
              required
            />
            <TextField
              label={t("yogaPlans.email")}
              value={draft?.buyerEmail || ""}
              onChange={(e) => setDraft((p) => ({ ...p, buyerEmail: e.target.value }))}
              fullWidth
            />
            <TextField
              type="number"
              label={t("yogaPlans.days")}
              value={draft?.totalDays ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, totalDays: e.target.value }))}
              inputProps={{ min: 1 }}
              fullWidth
            />
            <TextField
              type="number"
              label={t("yogaPlans.amount")}
              value={draft?.amountVnd ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, amountVnd: e.target.value }))}
              inputProps={{ min: 0 }}
              fullWidth
            />
            {draft?.sellerPlanCode && (
              <TextField
                select
                label={t("setup.column.state")}
                value={draft?.state || "ACTIVE"}
                onChange={(e) => setDraft((p) => ({ ...p, state: e.target.value }))}
                fullWidth
              >
                <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                <MenuItem value="INACTIVE">INACTIVE</MenuItem>
              </TextField>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default YogaPlansManager;
