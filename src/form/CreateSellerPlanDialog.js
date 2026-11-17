import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
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
 * One catalog row is only usable when the server actually described a plan.
 * An empty HTTP 200 body (a swallowed gateway failure) must not be mistaken
 * for "the catalog is empty", so every row is checked, not just the list.
 */
const isUsablePlan = (plan) =>
  plan &&
  typeof plan.planCode === "string" &&
  plan.planCode.trim() !== "" &&
  isFilledNumber(plan.fee) &&
  Number(plan.fee) >= 0 &&
  isFilledNumber(plan.planDay) &&
  Number(plan.planDay) > 0 &&
  isFilledNumber(plan.envCount) &&
  Number(plan.envCount) > 0;

const isCatalogPayload = (payload) =>
  payload !== null &&
  typeof payload === "object" &&
  Array.isArray(payload.items) &&
  payload.items.every(isUsablePlan);

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
  const [catalogLoading, setCatalogLoading] = useState(false);
  // Catalog failures live apart from form errors: the tab must be able to say
  // "the list could not be loaded, retry" instead of the misleading "no plans".
  const [catalogError, setCatalogError] = useState("");
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

  /**
   * Loads the catalog and reports whether the list is trustworthy: true only
   * after a well-formed response, false for a failed or malformed one, so the
   * caller never presents an empty body (a swallowed gateway failure) as an
   * empty catalog.
   */
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const res = await api.get(`${contextPath}/admin/v1/paymentPlan/catalog`);
      if (!isCatalogPayload(res.data)) {
        setCatalog([]);
        setCatalogError(t("createPlan.errors.invalidCatalog"));
        return false;
      }
      const items = res.data.items;
      setCatalog(items);
      // Keep the current pick when it survived the reload, otherwise fall back
      // to the first plan (or clear the pick on an empty catalog).
      setPlanCode((prev) =>
        prev && items.some((plan) => plan.planCode === prev)
          ? prev
          : items.length > 0
            ? items[0].planCode
            : ""
      );
      return true;
    } catch (err) {
      console.error("Failed to load payment plan catalog", err);
      setCatalog([]);
      setCatalogError(t("createPlan.errors.loadCatalog"));
      return false;
    } finally {
      setCatalogLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setMode(MODE_EXISTING);
      setPlanCode("");
      setCatalog([]);
      setCatalogLoading(false);
      setCatalogError("");
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
      // A failed catalog load must not let a stale selection be submitted as
      // if the list were current; the retry alert in the tab says what is wrong.
      if (catalogError) {
        setError(catalogError);
        return;
      }
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
      let catalogRefreshFailed = false;

      if (mode === MODE_NEW) {
        const createRes = await api.post(`${contextPath}/admin/v1/paymentPlan/create`, {
          fee: Number(newPlan.fee),
          planDay: Number(newPlan.planDay),
          envCount: Number(newPlan.envCount),
          description: newPlan.description?.trim() || "",
        });
        // An empty or malformed body means the creation is NOT confirmed;
        // reporting success here would hide exactly the gateway failure the
        // catalog bug came from, and a retry could then double-create.
        if (!isUsablePlan(createRes.data)) {
          onError?.(t("createPlan.errors.invalidCreateResponse"));
          return;
        }
        createdPlan = createRes.data;
        resolvedPlanCode = createdPlan.planCode;
        // keep the Existing plan tab in sync with what was just created
        catalogRefreshFailed = !(await loadCatalog());
      }

      if (!linkToSeller) {
        onSuccess?.({ createdPlan, catalogRefreshFailed });
        return;
      }

      const res = await api.post(`${contextPath}/admin/v1/createSellerPlan`, {
        username: username.trim(),
        planCode: resolvedPlanCode,
      });
      onSuccess?.({ ...(res.data || {}), createdPlan, catalogRefreshFailed });
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
              {catalogLoading && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    {t("createPlan.catalogLoading")}
                  </Typography>
                </Stack>
              )}
              {!catalogLoading && catalogError && (
                <Alert
                  severity="error"
                  action={
                    <Button size="small" color="inherit" onClick={loadCatalog}>
                      {t("createPlan.retry")}
                    </Button>
                  }
                >
                  {catalogError}
                </Alert>
              )}
              {!catalogLoading && !catalogError && catalog.length === 0 && (
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
