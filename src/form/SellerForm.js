import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import api from "../api";
import { useAuth } from "../AuthContext";
import ProductForm from "./ProductForm";

const contextPath = "/publiclink";

const SellerForm = ({ open, onClose, onSuccess, users = [] }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    username: "",
    link: "",
    name: "",
    durationHours: 24,
    priceAmount: 10000,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatedData, setGeneratedData] = useState(null);
  const [priceDisplay, setPriceDisplay] = useState("10,000");
  const productDataRef = useRef({});
  const priceInputRef = useRef(null);
  const { logout, username: createdBy } = useAuth();

  const usernameOptions = Array.from(
    new Set(
      users
        .map((user) => user?.username?.trim())
        .filter(Boolean)
    )
  );

  useEffect(() => {
    if (!open) {
      setError("");
      setSubmitting(false);
      setStep(1);
      setGeneratedData(null);
      setPriceDisplay("10,000");
      productDataRef.current = {};
      setForm({
        username: "",
        link: "",
        name: "",
        durationHours: 24,
        priceAmount: 10000,
      });
    }
  }, [open]);

  const handleFieldChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const formatVND = (value) => {
    if (value === "" || value === undefined || value === null) return "";
    const num = Number(value);
    if (Number.isNaN(num)) return "";
    return num.toLocaleString("en-US");
  };

  const handlePriceFocus = () => {
    setPriceDisplay(String(form.priceAmount || ""));
  };

  const handlePriceBlur = () => {
    setPriceDisplay(formatVND(form.priceAmount));
  };

  const handlePriceChange = (e) => {
    const raw = e.target.value.replace(/,/g, "");
    const num = raw === "" ? "" : Number(raw);
    if (raw !== "" && Number.isNaN(Number(raw))) return;
    setPriceDisplay(raw);
    handleFieldChange("priceAmount", num);
  };

  const handleNext = async () => {
    const username = form.username.trim();
    const link = form.link.trim();
    const name = form.name.trim();
    const durationHours = Number(form.durationHours) || 24;
    const priceAmount = Number(form.priceAmount) || 10000;

    if (!username && !link && !name) {
      setError("At least one of Username, Name, or Facebook link is required.");
      return;
    }

    if (durationHours <= 0 || priceAmount < 0) {
      setError("Duration must be positive and price cannot be negative.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const sellerRequest = {
        username,
        link,
        name,
        price: {
          durationHours,
          priceAmount,
          currency: "VND",
        },
      };

      const generatorResponse = await api.post(
        `${contextPath}/api/generator/generateRequestId`,
        {
          sellerRequest,
          productName: "",
        }
      );

      const generatorData = generatorResponse.data || {};
      setGeneratedData({
        requestUuid: generatorData.requestUuid,
        sellerName: generatorData.sellerName || username,
      });

      setStep(2);
    } catch (err) {
      if (err?.response?.status === 403) {
        logout();
        return;
      }

      console.error("API Error:", err);
      setError(
        err?.response?.data?.message ||
        "Unable to generate request ID right now."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Convert a File object to a Base64 data URI.
   *
   * Best practice: For production with large images, prefer
   * multipart/form-data via a dedicated upload endpoint.
   * Base64 is suitable here because the backend accepts JSON
   * (@RequestBody) and PictureDTO.link stores URL strings.
   * Product images are expected to be small (< 1 MB each),
   * so the ~33% size overhead of Base64 is acceptable.
   */
  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const handleProductDataChange = (data) => {
    productDataRef.current = data;
  };

  const handleProductSubmit = async () => {
    if (!generatedData?.requestUuid) {
      setError("Missing request data. Please go back and try again.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const sellerRequest = {
        username: form.username.trim(),
        link: form.link.trim(),
        name: form.name.trim(),
        price: {
          durationHours: Number(form.durationHours) || 24,
          priceAmount: Number(form.priceAmount) || 10000,
          currency: "VND",
        },
      };

      const productData = productDataRef.current;
      const hasProductData =
        productData.productName ||
        productData.description ||
        productData.quantity ||
        productData.price ||
        (productData.images && productData.images.length > 0);

      // Build the combined request body with product data
      const requestBody = {
        requestUuid: generatedData.requestUuid,
        sellerRequest,
      };

      if (hasProductData) {
        // Encode images as base64 data URIs for JSON transport
        const imageUrls =
          productData.images && productData.images.length > 0
            ? await Promise.all(
              productData.images.map((file) => readFileAsBase64(file))
            )
            : [];

        requestBody.productRequest = {
          productName: productData.productName || "",
          description: productData.description || "",
          totalAmount: productData.quantity ? Number(productData.quantity) : 0,
          price: productData.price ? Number(productData.price) : 0,
          images: imageUrls,
        };
      }

      const environmentResponse = await api.post(
        `${contextPath}/api/generator/createSaleEnvironment`,
        requestBody
      );

      const environmentData = environmentResponse.data || {};
      const nextRecord = {
        createdAt: environmentData.createdAt || "",
        createdBy: createdBy || "-",
        envStatus: true,
        productName: productData.productName || "",
        publicLink: environmentData.urlString || "",
        requestUUID:
          environmentData.requestUUID || generatedData.requestUuid || "",
        sellerAuthLink: environmentData.authLink || "",
        sellerAuthLinkExpire: environmentData.expired || "",
        sellerName: generatedData.sellerName,
      };

      onSuccess?.({
        message: `Generated seller environment for ${nextRecord.sellerName}.`,
        record: nextRecord,
      });
      onClose?.();
    } catch (err) {
      if (err?.response?.status === 403) {
        logout();
        return;
      }

      console.error("API Error:", err);
      setError(
        err?.response?.data?.message ||
        "Unable to generate the seller environment right now."
      );
    } finally {
      setSubmitting(false);
    }
  };

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
      PaperProps={{
        sx: {
          borderRadius: 1,
        },
      }}
    >
      <DialogTitle>
        {step === 1 ? "Generate Product Link" : "Product Details"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {step === 1 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Select an existing username or type a new seller username, then
                create the seller environment and public link in one flow.
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <Autocomplete
                freeSolo
                autoHighlight
                options={usernameOptions}
                filterOptions={(options, { inputValue }) => {
                  const query = inputValue.trim().toLowerCase();

                  if (!query) {
                    return options;
                  }

                  return options.filter((option) =>
                    option.toLowerCase().includes(query)
                  );
                }}
                inputValue={form.username}
                onInputChange={(_, newInputValue, reason) => {
                  if (reason === "input" || reason === "clear") {
                    handleFieldChange("username", newInputValue);
                  }
                }}
                onChange={(_, newValue) => {
                  handleFieldChange("username", newValue || "");
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Username" name="username" />
                )}
              />
              <TextField
                label="Name"
                name="name"
                value={form.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
              />
              <TextField
                label="Facebook link or profile"
                name="link"
                value={form.link}
                onChange={(event) => handleFieldChange("link", event.target.value)}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Duration (hours)"
                  name="durationHours"
                  type="number"
                  inputProps={{ min: 1 }}
                  value={form.durationHours}
                  onChange={(event) => handleFieldChange("durationHours", event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Price (VND)"
                  name="priceAmount"
                  type="text"
                  inputRef={priceInputRef}
                  value={priceDisplay}
                  onFocus={handlePriceFocus}
                  onBlur={handlePriceBlur}
                  onChange={handlePriceChange}
                  fullWidth
                />
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
              Cancel
            </Button>
            <Button
              onClick={handleNext}
              variant="contained"
              disabled={submitting}
            >
              Next
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleBack} disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={handleProductSubmit}
              variant="contained"
              disabled={submitting}
            >
              Submit
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SellerForm;
