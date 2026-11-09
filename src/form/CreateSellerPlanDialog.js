import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import api from "../api";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";
const MODE_EXISTING = "existing";
const MODE_NEW = "new";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

/**
 * Admin dialog that assigns a payment plan to a seller. The plan can be picked
 * from the catalog or defined inline on a single line (fee | days | links).
 * On success the parent shows the payment URL dialog (CreatePaymentPlanResult).
 */
const CreateSellerPlanDialog = ({ open, onClose, onSuccess, onError, users = [] }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState(MODE_EXISTING);
  const [catalog, setCatalog] = useState([]);
  const [planCode, setPlanCode] = useState("");
  const [newPlan, setNewPlan] = useState({ fee: 10000, planDay: 3, envCount: 1, description: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const usernameOptions = useMemo(
    () => Array.from(new Set(users.map((user) => user?.username?.trim()).filter(Boolean))),
    [users]
  );

  useEffect(() => {
    if (!open) {
      setUsername("");
      setMode(MODE_EXISTING);
      setPlanCode("");
      setNewPlan({ fee: 10000, planDay: 3, envCount: 1, description: "" });
      setError("");
      setSubmitting(false);
      return;
    }

    const loadCatalog = async () => {
      try {
        const res = await api.get(`${contextPath}/admin/v1/paymentPlan/catalog`);
        const items = res.data?.items || [];
        setCatalog(items);
        if (items.length > 0) {
          setPlanCode((prev) => prev || items[0].planCode);
        }
      } catch (err) {
        console.error("Failed to load payment plan catalog", err);
        setError(t("createPlan.errors.loadCatalog"));
      }
    };

    loadCatalog();
  }, [open, t]);

  const handleNewPlanChange = (field, value) => {
    const parsed = field === "description" ? value : Number(String(value).replace(/,/g, ""));
    setNewPlan((prev) => ({
      ...prev,
      [field]: field === "description" ? value : Number.isNaN(parsed) ? "" : parsed,
    }));
  };

  const handleSubmit = async () => {
    setError("");

    if (!username.trim()) {
      setError(t("createPlan.errors.missingUser"));
      return;
    }

    const payload = { username: username.trim() };
    if (mode === MODE_EXISTING) {
      if (!planCode) {
        setError(t("createPlan.errors.missingPlan"));
        return;
      }
      payload.planCode = planCode;
    } else {
      if (!newPlan.fee || !newPlan.planDay || !newPlan.envCount) {
        setError(t("createPlan.errors.invalidNewPlan"));
        return;
      }
      payload.newPlan = {
        fee: Number(newPlan.fee),
        planDay: Number(newPlan.planDay),
        envCount: Number(newPlan.envCount),
        description: newPlan.description?.trim() || "",
      };
    }

    try {
      setSubmitting(true);
      const res = await api.post(`${contextPath}/admin/v1/createSellerPlan`, payload);
      onSuccess?.(res.data || {});
    } catch (err) {
      console.error("Failed to create seller plan", err);
      // Success and failure both belong to the "Next" dialog per the flow spec
      onError?.(
        err?.response?.data?.errorMessage || t("createPlan.errors.submit")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("createPlan.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("createPlan.subtitle")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("createPlan.field.user")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            select
            size="small"
          >
            {usernameOptions.length === 0 && (
              <MenuItem value="" disabled>
                {t("createPlan.noUsers")}
              </MenuItem>
            )}
            {usernameOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_event, next) => next && setMode(next)}
          >
            <ToggleButton value={MODE_EXISTING}>{t("createPlan.mode.existing")}</ToggleButton>
            <ToggleButton value={MODE_NEW}>{t("createPlan.mode.new")}</ToggleButton>
          </ToggleButtonGroup>

          {mode === MODE_EXISTING ? (
            <Stack spacing={1}>
              <Typography variant="subtitle2">{t("createPlan.pickPlan")}</Typography>
              {catalog.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t("createPlan.noPlans")}
                </Typography>
              )}
              {catalog.map((plan) => {
                const selected = plan.planCode === planCode;
                return (
                  <Box
                    key={plan.planCode}
                    onClick={() => setPlanCode(plan.planCode)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 2,
                      py: 1,
                      cursor: "pointer",
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: selected ? "primary.main" : "divider",
                      bgcolor: selected ? "action.selected" : "background.paper",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 90 }}>
                      {formatVND(plan.fee)} VND
                    </Typography>
                    <Divider orientation="vertical" flexItem />
                    <Typography variant="body2" color="text.secondary">
                      {plan.planDay} {t("createPlan.unit.day")}
                    </Typography>
                    <Divider orientation="vertical" flexItem />
                    <Typography variant="body2" color="text.secondary">
                      {plan.envCount} {t("createPlan.unit.link")}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center">
              <TextField
                size="small"
                label={t("createPlan.field.fee")}
                type="number"
                value={newPlan.fee}
                onChange={(event) => handleNewPlanChange("fee", event.target.value)}
                sx={{ width: { xs: "100%", sm: 150 } }}
              />
              <Typography variant="body2" color="text.secondary">
                |
              </Typography>
              <TextField
                size="small"
                label={t("createPlan.field.planDay")}
                type="number"
                value={newPlan.planDay}
                onChange={(event) => handleNewPlanChange("planDay", event.target.value)}
                sx={{ width: { xs: "100%", sm: 120 } }}
              />
              <Typography variant="body2" color="text.secondary">
                |
              </Typography>
              <TextField
                size="small"
                label={t("createPlan.field.envCount")}
                type="number"
                value={newPlan.envCount}
                onChange={(event) => handleNewPlanChange("envCount", event.target.value)}
                sx={{ width: { xs: "100%", sm: 120 } }}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateSellerPlanDialog;
