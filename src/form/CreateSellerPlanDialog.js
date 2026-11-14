import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
 * Fee, days and links come from type="number" inputs, so the state holds a
 * number or "" when the box is empty. An empty box must not be read as 0.
 */
const isFilledNumber = (value) =>
  value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value));

/**
 * A free plan is a real plan: a fee of 0 is valid and only has to be filled in.
 * Days and links are what must be greater than zero.
 */
const isValidNewPlan = (plan) =>
  isFilledNumber(plan.fee) &&
  Number(plan.fee) >= 0 &&
  isFilledNumber(plan.planDay) &&
  Number(plan.planDay) > 0 &&
  isFilledNumber(plan.envCount) &&
  Number(plan.envCount) > 0;

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

  const sellerOptions = useMemo(() => {
    const byUsername = new Map();
    users.forEach((user) => {
      const name = user?.username?.trim();
      if (name && !byUsername.has(name)) {
        byUsername.set(name, {
          username: name,
          name: user?.name?.trim() || "",
          email: user?.email?.trim() || "",
        });
      }
    });
    return Array.from(byUsername.values()).sort((a, b) =>
      a.username.localeCompare(b.username)
    );
  }, [users]);

  const selectedSeller = useMemo(
    () => sellerOptions.find((seller) => seller.username === username) || null,
    [sellerOptions, username]
  );

  // Client-side search: one term matches username, seller name or email/link
  const filterSellers = (options, { inputValue }) => {
    const term = inputValue.trim().toLowerCase();
    if (!term) {
      return options;
    }
    return options.filter((option) =>
      [option.username, option.name, option.email]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  };

  const loadCatalog = useCallback(async () => {
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
  }, [t]);

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

    loadCatalog();
  }, [open, loadCatalog]);

  const handleNewPlanChange = (field, value) => {
    const parsed = field === "description" ? value : Number(String(value).replace(/,/g, ""));
    setNewPlan((prev) => ({
      ...prev,
      [field]: field === "description" ? value : Number.isNaN(parsed) ? "" : parsed,
    }));
  };

  /**
   * Two independent steps, matching the backend split:
   * 1. the plan is created on its own, with no seller involved;
   * 2. linking it to a seller is a follow-up call, done only when one was
   *    picked. Without a seller the plan simply joins the catalog.
   */
  const handleSubmit = async () => {
    setError("");

    // Free text is allowed in the search box, so a filled-in seller must be an
    // actual pick: the backend resolves it by exact username
    if (username.trim() && !selectedSeller) {
      setError(t("createPlan.errors.invalidUser"));
      return;
    }

    const linkToSeller = Boolean(selectedSeller);

    if (mode === MODE_EXISTING) {
      if (!planCode) {
        setError(t("createPlan.errors.missingPlan"));
        return;
      }
      // Assigning an already existing plan is the only thing this tab can do
      if (!linkToSeller) {
        setError(t("createPlan.errors.sellerRequiredForExisting"));
        return;
      }
    } else if (!isValidNewPlan(newPlan)) {
      setError(t("createPlan.errors.invalidNewPlan"));
      return;
    }

    try {
      setSubmitting(true);

      let resolvedPlanCode = planCode;
      let createdPlan = null;

      if (mode === MODE_NEW) {
        const createRes = await api.post(`${contextPath}/admin/v1/paymentPlan/create`, {
          fee: Number(newPlan.fee),
          planDay: Number(newPlan.planDay),
          envCount: Number(newPlan.envCount),
          description: newPlan.description?.trim() || "",
        });
        createdPlan = createRes.data || {};
        resolvedPlanCode = createdPlan.planCode;
        // keep the Existing plan tab in sync with what was just created
        await loadCatalog();
      }

      if (!linkToSeller) {
        onSuccess?.({ createdPlan });
        return;
      }

      const res = await api.post(`${contextPath}/admin/v1/createSellerPlan`, {
        username: username.trim(),
        planCode: resolvedPlanCode,
      });
      onSuccess?.({ ...(res.data || {}), createdPlan });
    } catch (err) {
      console.error("Failed to create payment plan", err);
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

          <Autocomplete
            options={sellerOptions}
            value={selectedSeller}
            onChange={(_event, nextValue) => setUsername(nextValue?.username || "")}
            onInputChange={(_event, nextInput, reason) => {
              if (reason === "input" || reason === "clear") {
                setUsername(nextInput.trim());
              }
            }}
            getOptionLabel={(option) => option?.username || ""}
            isOptionEqualToValue={(option, value) => option.username === value?.username}
            filterOptions={filterSellers}
            noOptionsText={
              username.trim()
                ? t("createPlan.noMatchingUsers")
                : t("createPlan.noUsers")
            }
            blurOnSelect
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ flexDirection: "column", alignItems: "flex-start", gap: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {option.username}
                </Typography>
                {(option.name || option.email) && (
                  <Typography variant="caption" color="text.secondary">
                    {[option.name, option.email].filter(Boolean).join(" \u00b7 ")}
                  </Typography>
                )}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={t("createPlan.field.userOptional")}
                placeholder={t("createPlan.searchUserPlaceholder")}
                helperText={t("createPlan.sellerOptionalHint")}
              />
            )}
          />

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
