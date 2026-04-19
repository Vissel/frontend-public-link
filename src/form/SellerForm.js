import React, { useEffect, useState } from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Button,
  Typography,
} from "@mui/material";
import api from "../api";
import { useAuth } from "../AuthContext";

const SellerForm = ({ open, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    username: "",
    link: "",
    productName: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { logout } = useAuth();

  useEffect(() => {
    if (!open) {
      setError("");
      setSubmitting(false);
      setForm({
        username: "",
        link: "",
        productName: "",
      });
    }
  }, [open]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        accessToken: localStorage.getItem("token"),
        username: form.username,
        link: form.link,
        productName: form.productName,
      };
      const res = await api.post("/api/generator/generatePublicLink", payload);
      if (res.status === 200) {
        onSuccess?.(res.data);
        onClose();
      }
      if (res.status === 403) {
        logout();
      }
    } catch (error) {
      console.error("API Error:", error);
      setError(
        error?.response?.data?.message ||
          "Unable to generate the product link right now."
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
            Create a new seller record and public product link using the shared
            MUI form flow.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Username"
            name="username"
            value={form.username}
            onChange={handleChange}
          />
          <TextField
            label="Facebook link or profile"
            name="link"
            value={form.link}
            onChange={handleChange}
          />
          <TextField
            label="Product name"
            name="productName"
            value={form.productName}
            onChange={handleChange}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SellerForm;
