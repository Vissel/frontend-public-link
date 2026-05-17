import React, { useEffect, useState } from "react";
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

const contextPath = "/publiclink";

const SellerForm = ({ open, onClose, onSuccess, users = [] }) => {
  const [form, setForm] = useState({
    username: "",
    link: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      setForm({
        username: "",
        link: "",
      });
    }
  }, [open]);

  const handleFieldChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const username = form.username.trim();
    const link = form.link.trim();

    if (!username || !link) {
      setError("Username and Facebook link are required.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const sellerRequest = {
        username,
        link,
      };

      const generatorResponse = await api.post(
        `${contextPath}/api/generator/generateRequestId`,
        {
          sellerRequest,
          productName: "",
        }
      );

      const generatorData = generatorResponse.data || {};
      const environmentResponse = await api.post(
        `${contextPath}/api/generator/createSaleEnvironment`,
        {
          requestUuid: generatorData.requestUuid,
          sellerRequest,
        }
      );

      const environmentData = environmentResponse.data || {};
      const nextRecord = {
        createdAt: environmentData.createdAt || generatorData.createdAt || "",
        createdBy: createdBy || "-",
        envStatus: true,
        productName: "",
        publicLink: environmentData.urlString || "",
        requestUUID:
          environmentData.requestUUID || generatorData.requestUuid || "",
        sellerAuthLink: environmentData.authLink || "",
        sellerAuthLinkExpire: environmentData.expired || "",
        sellerName: generatorData.sellerName || username,
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

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 4,
        },
      }}
    >
      <DialogTitle>Generate Product Link</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
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
              <TextField {...params} label="Username" name="username" required />
            )}
          />
          <TextField
            label="Facebook link or profile"
            name="link"
            value={form.link}
            onChange={(event) => handleFieldChange("link", event.target.value)}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SellerForm;
