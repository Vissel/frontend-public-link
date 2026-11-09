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
  Stack,
  Typography,
} from "@mui/material";
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import ProductForm from "./ProductForm";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });

/**
 * Seller "Generate Product Link" flow: choose one of the seller's ACTIVE
 * payment plans, pass the quota gate, then fill in the product. The seller
 * cannot create a plan, only consume the ones the admin assigned.
 */
const SellerGenerateForm = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { username, logout } = useAuth();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [error, setError] = useState("");
  const [planNotice, setPlanNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const productDataRef = useRef({});

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planUserCode === selectedPlanCode) || null,
    [plans, selectedPlanCode]
  );

  const resetForm = useCallback(() => {
    setStep(1);
    setPlans([]);
    setSelectedPlanCode("");
    setError("");
    setPlanNotice("");
    setSubmitting(false);
    productDataRef.current = {};
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }

    const loadPlans = async () => {
      try {
        setLoadingPlans(true);
        const res = await pubApi.get(`${contextPath}/api/v1/sellerPlan/myPlans`);
        const items = res.data?.items || [];
        setPlans(items);
        setSelectedPlanCode(items.length > 0 ? items[0].planUserCode : "");
        if (items.length === 0) {
          setPlanNotice(t("sellerGenerate.noPlan"));
        }
      } catch (err) {
        console.error("Failed to load own payment plans", err);
        setPlans([]);
        setPlanNotice(t("sellerGenerate.noPlan"));
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, [open, resetForm, t]);

  const handleProductDataChange = (data) => {
    productDataRef.current = data;
  };

  const handleNext = async () => {
    setError("");
    setPlanNotice("");

    if (!selectedPlan) {
      setPlanNotice(t("sellerGenerate.noPlan"));
      return;
    }

    try {
      const res = await pubApi.post(`${contextPath}/api/v1/sellerPlan/check`);
      const data = res.data || {};
      if (!data.allowed) {
        setPlanNotice(data.message || t("sellerGenerate.quotaExhausted"));
        return;
      }
      setStep(2);
    } catch (err) {
      if (err?.response?.status === 403) {
        logout();
        return;
      }
      console.error("Failed to check quota", err);
      setError(err?.response?.data?.errorMessage || t("sellerGenerate.errors.checkQuota"));
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    try {
      const durationHours = Math.max(1, Number(selectedPlan?.planDay || 1) * 24);
      const sellerRequest = {
        username: (username || "").trim(),
        link: "",
        name: selectedPlan?.displayName || username || "",
        price: {
          durationHours,
          priceAmount: Number(selectedPlan?.fee || 0),
          currency: "VND",
        },
      };

      const generatorResponse = await pubApi.post(`${contextPath}/api/generator/generateRequestId`, {
        sellerRequest,
        productName: "",
      });

      const generatorData = generatorResponse.data || {};
      const requestUuid = generatorData.requestUuid;

      if (!requestUuid) {
        throw new Error(t("sellerGenerate.errors.generateRequestId"));
      }

      const productData = productDataRef.current;
      const hasProductData =
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
        };
      }

      const environmentResponse = await pubApi.post(
        `${contextPath}/api/generator/createSaleEnvironment`,
        requestBody
      );

      onSuccess?.({
        message: t("sellerGenerate.success"),
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
        t("sellerGenerate.errors.submit")
      );
    } finally {
      setSubmitting(false);
    }
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
        {step === 1 ? t("sellerGenerate.titleStep1") : t("sellerGenerate.titleStep2")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {step === 1 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {t("sellerGenerate.subtitleStep1")}
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              {planNotice && <Alert severity="warning">{planNotice}</Alert>}

              {loadingPlans && (
                <Typography variant="body2" color="text.secondary">
                  {t("common.loading")}
                </Typography>
              )}

              {!loadingPlans && plans.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t("sellerGenerate.noPlan")}
                </Typography>
              )}

              <Stack spacing={1}>
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
                        {plan.planDay} {t("sellerGenerate.unit.day")}
                      </Typography>
                      <Divider orientation="vertical" flexItem />
                      <Typography variant="body2" color="text.secondary">
                        {t("sellerGenerate.remaining")}: {plan.remaining}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </>
          ) : (
            <>
              {error && <Alert severity="error">{error}</Alert>}
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
            <Button onClick={handleNext} variant="contained" disabled={submitting || loadingPlans}>
              {t("common.next")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep(1)} disabled={submitting}>
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

export default SellerGenerateForm;
