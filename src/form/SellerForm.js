import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
} from "@mui/material";
import api from "../api";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";

const SellerForm = ({ open, onClose, onSuccess }) => {
  const [form, setForm] = useState({ username: "", link: "" });
  const navigate = useNavigate();
  const logout = useAuth();
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        accessToken: localStorage.getItem("token"),
        username: form.username,
        link: form.link,
        productName: form.productName,
      };
      const res = await api.post("/api/generator/generatePublicLink", payload);
      if (res.status === 200) {
        // navigate("/home", { state: { requestData: res.data } });
        onSuccess(res.data);
        onClose();
      }
      if (res.status === 403) {
        logout();
      }
    } catch (error) {
      console.error("API Error:", error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Enter Info</DialogTitle>
      <DialogContent>
        <TextField
          margin="dense"
          label="Username"
          name="username"
          fullWidth
          variant="outlined"
          value={form.username}
          onChange={handleChange}
        />
        <TextField
          margin="dense"
          label="Link"
          name="link"
          fullWidth
          variant="outlined"
          value={form.link}
          onChange={handleChange}
        />
        <TextField
          margin="dense"
          label="ProductName"
          name="productName"
          fullWidth
          variant="outlined"
          value={form.productName}
          onChange={handleChange}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SellerForm;
