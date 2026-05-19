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
import api from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";

const SaleEnvPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const requestUuid = queryParams.get("requestUuid");

  const [saleData, setSaleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!requestUuid) {
      setError("Missing request UUID.");
      setLoading(false);
      return;
    }

    api
      .get("/api/v1/publish/getSaleUrl", { params: { requestUuid } })
      .then((response) => {
        setSaleData(response.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch sale URL:", err);
        setError(
          err?.response?.data?.message ||
          "Unable to load sale information."
        );
        setLoading(false);
      });
  }, [requestUuid]);

  const handleCopy = () => {
    if (!saleData?.publicLink) return;
    const fullLink = `${window.location.origin}/api/v1/publish/link?token=${encodeURIComponent(saleData.publicLink)}`;
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
            Loading...
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
              ← Seller home page
            </Button>
            <Alert severity="error">
              {error || "Sale information not found."}
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
            ← Seller home page
          </Button>

          <TextField
            label="Seller Name"
            value={saleData.sellerName || ""}
            slotProps={{ input: { readOnly: true } }}
            variant="outlined"
            fullWidth
          />

          <TextField
            label="Public Link"
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
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                ),
              },
            }}
            variant="outlined"
            fullWidth
          />

          <TextField
            label="Environment State"
            value={saleData.envState ? "Active" : "Inactive"}
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
