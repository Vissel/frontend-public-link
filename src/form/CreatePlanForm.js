import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Typography,
} from "@mui/material";
import api from "../api";
import { useAuth } from "../AuthContext";
import ProductForm from "./ProductForm";
import { useTranslation } from "react-i18next";
import { clampedDurationHours, effectiveLinkExpiry, formatDateTime } from "../util/planWindow";

const contextPath = "/publiclink";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

/**
 * Admin "Generate Product Link" flow.
 *
 * Screen 1: pick the seller and one of the seller's ACTIVE payment plans.
 * Next calls the quota gate; screen 2 is only reachable while the plan still
 * has an environment left. Submit creates the request + sale environment only
 * (the payment plan itself is managed from the Create Payment Plan dialog).
 */
const CreatePlanForm = ({ open, onClose, onSuccess, users = [] }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [plans, setPlans] = useState([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [error, setError] = useState("");
  const [planNotice, setPlanNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planGate, setPlanGate] = useState(null);
  const productDataRef = useRef({});
  const { logout } = useAuth();

  const usernameOptions = useMemo(
    () => Array.from(new Set(users.map((user) => user?.username?.trim()).filter(Boolean))),
    [users]
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planUserCode === selectedPlanCode) || null,
    [plans, selectedPlanCode]
  );

  const resetForm = useCallback(() => {
    setStep(1);
    setUsername("");
    setPlans([]);
    setSelectedPlanCode("");
    setError("");
    setPlanNotice("");
    setPlanGate(null);
    setSubmitting(false);
    productDataRef.current = {};
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || !username.trim()) {
      return;
    }

    const loadPlans = async () => {
      try {
        setLoadingPlans(true);
        setError("");
        const res = await api.get(`${contextPath}/admin/v1/paymentPlan/userPlans`, {
          params: { username: username.trim() },
        });
        const items = res.data?.items || [];
        setPlans(items);
        setSelectedPlanCode(items.length > 0 ? items[0].planUserCode : "");
        setPlanNotice(
          items.length === 0 ? t("generatePlan.noPlan") : ""
        );
      } catch (err) {
        console.error("Failed to load seller plans", err);
        setPlans([]);
        setSelectedPlanCode("");
        setPlanNotice(t("generatePlan.noPlan"));
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, [open, username, t]);

  const handleProductDataChange = (data) => {
    productDataRef.current = data;
  };

  const handleNext = async () => {
    setError("");
    setPlanNotice("");

    if (!username.trim()) {
      setError(t("generatePlan.errors.missingUser"));
      return;
    }

    if (!selectedPlan) {
      setPlanNotice(t("generatePlan.noPlan"));
      return;
    }

    try {
      const res = await api.post(`${contextPath}/admin/v1/paymentPlan/check`, {
        username: username.trim(),
      });
      const data = res.data || {};
      if (!data.allowed) {
        setPlanNotice(data.message || t("generatePlan.quotaExhausted"));
        return;
      }
      setPlanGate(data);
      setStep(2);
    } catch (err) {
      if (err?.response?.status === 403) {
        logout();
        return;
      }
      console.error("Failed to check payment plan quota", err);
      setError(
        err?.response?.data?.errorMessage || t("generatePlan.errors.checkQuota")
      );
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    try {
      // Never ask for more validity than the paid window allows; the backend
      // clamps again, this keeps the UI honest about the real expiry.
      const durationHours = clampedDurationHours(
        selectedPlan?.planDay,
        planGate?.endedDate || selectedPlan?.endedDate
      );
      const sellerRequest = {
        username: username.trim(),
        link: "",
        name: selectedPlan?.displayName || username.trim(),
        price: {
          durationHours,
          priceAmount: Number(selectedPlan?.fee || 0),
          currency: "VND",
        },
      };

      const generatorResponse = await api.post(
        `${contextPath}/api/generator/generateRequestId`,
        { sellerRequest, productName: "" }
      );

      const generatorData = generatorResponse.data || {};
      const requestUuid = generatorData.requestUuid;
      const sellerName = generatorData.sellerName || username.trim();

      if (!requestUuid) {
        throw new Error(t("generatePlan.errors.generateRequestId"));
      }

      const productData = productDataRef.current;
      const isYoga = productData.productType === "YOGA_BOOKING";
      const hasProductData =
        isYoga ||
        productData.productName ||
        productData.description ||
        productData.quantity ||
        productData.price ||
        (productData.images && productData.images.length > 0);

      const requestBody = { requestUuid, sellerRequest };

      if (hasProductData) {
        const imageUrls =
          productData.images && productData.images.length > 0
            ? await Promise.all(productData.images.map((file) => readFileAsBase64(file)))
            : [];

        requestBody.productRequest = {
          productName: productData.productName || "",
          description: productData.description || "",
          totalAmount: productData.quantity ? Number(productData.quantity) : 0,
          price: productData.price ? Number(productData.price) : 0,
          images: imageUrls,
          productType: productData.productType || "STANDARD",
        };
      }

      const environmentResponse = await api.post(
        `${contextPath}/api/generator/createSaleEnvironment`,
        requestBody
      );

      onSuccess?.({
        message: `${t("generatePlan.success", { sellerName })}`,
        record: environmentResponse.data || {},
      });
      onClose?.();
    } catch (err) {
      if (err?.response?.status === 403) {
        logout();
        return;
      }

      console.error("API Error:", err);
      setError(
        err?.response?.data?.errorMessage ||
        err?.response?.data?.message ||
        t("generatePlan.errors.submit")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });

  const handleBack = () => {
    setError("");
    setStep(1);
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { borderRadius: 1 } }}
    >
      <DialogTitle>
        {step === 1 ? t("generatePlan.titleStep1") : t("generatePlan.titleStep2")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {step === 1 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {t("generatePlan.subtitleStep1")}
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              {planNotice && <Alert severity="warning">{planNotice}</Alert>}

              <TextField
                label={t("generatePlan.field.user")}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                select
                size="small"
              >
                {usernameOptions.length === 0 && (
                  <MenuItem value="" disabled>
                    {t("generatePlan.noUsers")}
                  </MenuItem>
                )}
                {usernameOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>

              <Stack spacing={1}>
                <Typography variant="subtitle2">
                  {t("generatePlan.pickPlan")}
                </Typography>
                {loadingPlans && (
                  <Typography variant="body2" color="text.secondary">
                    {t("common.loading")}
                  </Typography>
                )}
                {!loadingPlans && plans.length === 0 && username.trim() && (
                  <Typography variant="body2" color="text.secondary">
                    {t("generatePlan.noPlan")}
                  </Typography>
                )}
                {plans.map((plan) => {
                  const isSelected = plan.planUserCode === selectedPlanCode;
                  return (
                    <Box
                      key={plan.planUserCode}
                      onClick={() => setSelectedPlanCode(plan.planUserCode)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 2,
                        py: 1,
                        cursor: "pointer",
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: isSelected ? "primary.main" : "divider",
                        bgcolor: isSelected ? "action.selected" : "background.paper",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatVND(plan.fee)} VND
                      </Typography>
                      <Divider orientation="vertical" flexItem />
                      <Typography variant="body2" color="text.secondary">
                        {plan.planDay} {t("generatePlan.unit.day")}
                      </Typography>
                      <Divider orientation="vertical" flexItem />
                      <Typography variant="body2" color="text.secondary">
                        {t("generatePlan.remaining")}: {plan.remaining}
                      </Typography>
                      <Divider orientation="vertical" flexItem />
                      <Typography variant="caption" color="text.secondary">
                        {t("generatePlan.validUntil")}: {plan.endedDate || "-"}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </>
          ) : (
            <>
              {error && <Alert severity="error">{error}</Alert>}
              <Alert severity="info">
                {t("generatePlan.linkExpiryNotice", {
                  expiry: formatDateTime(
                    effectiveLinkExpiry(
                      selectedPlan?.planDay,
                      planGate?.endedDate || selectedPlan?.endedDate
                    )
                  ),
                })}
              </Alert>
              <ProductForm onDataChange={handleProductDataChange} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {step === 1 ? (
          <>
            <Button onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleNext}
              variant="contained"
              disabled={submitting || loadingPlans}
            >
              {t("common.next")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleBack} disabled={submitting}>
              {t("common.back")}
            </Button>
            <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
              {t("common.submit")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CreatePlanForm;
