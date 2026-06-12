import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";
import { useTranslation } from "react-i18next";

const SaleEnvPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const requestUuid = queryParams.get("requestUuid");

  const [saleData, setSaleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!requestUuid) {
      setError(t("saleUrl.errors.missingUuid"));
      setLoading(false);
      return;
    }

    pubApi
      .get(`/api/v1/publish/getSaleUrl`, { params: { requestUuid } })
      .then((response) => {
        setSaleData(response.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch sale URL:", err);
        setError(
          err?.response?.data?.message ||
          t("saleUrl.errors.unableToLoad")
        );
        setLoading(false);
      });
  }, [requestUuid]);

  const handleCopy = () => {
    if (!saleData?.publicLink) return;
    const fullLink = `${window.location.origin}${saleData.publicLink}`;
    navigator.clipboard
      .writeText(fullLink)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        const textArea = document.createElement("textarea");
        textArea.value = fullLink;
        textArea.style.position = "fixed";
        textArea.style.opacity = 0;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  };

  if (loading) {
    return (
      <PageContainer maxWidth="sm">
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          justifyContent="center"
          sx={{ py: 8 }}
        >
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            {t("common.loading")}
          </Typography>
        </Stack>
      </PageContainer>
    );
  }

  if (error || !saleData) {
    return (
      <PageContainer maxWidth="sm">
        <CardWrapper>
          <Stack spacing={2}>
            <Button
              variant="text"
              sx={{ alignSelf: "flex-start", p: 0, textTransform: "none" }}
              onClick={() => navigate("/sellerHome")}
            >
              {t("saleUrl.backToSellerHome")}
            </Button>
            <Alert severity="error">
              {error || t("saleUrl.errors.notFound")}
            </Alert>
          </Stack>
        </CardWrapper>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="md">
      <CardWrapper>
        <Stack spacing={3}>
          <Button
            variant="text"
            sx={{ alignSelf: "flex-start", p: 0, textTransform: "none" }}
            onClick={() => navigate("/sellerHome")}
          >
            {t("saleUrl.backToSellerHome")}
          </Button>

          <TextField
            label={t("saleUrl.sellerName")}
            value={saleData.sellerName || ""}
            slotProps={{ input: { readOnly: true } }}
            variant="outlined"
            fullWidth
          />

          <TextField
            label={t("saleUrl.publicLink")}
            value={saleData.publicLink || ""}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleCopy}
                    sx={{ minWidth: 80, mr: -0.5 }}
                  >
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                ),
              },
            }}
            variant="outlined"
            fullWidth
          />

          <TextField
            label={t("saleUrl.environmentState")}
            value={saleData.envState ? t("common.active") : t("common.inactive")}
            slotProps={{ input: { readOnly: true } }}
            variant="outlined"
            fullWidth
          />
        </Stack>
      </CardWrapper>
    </PageContainer>
  );
};

export default SaleEnvPage;
