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
import { useNavigate } from "react-router-dom";

const SellerForm = ({ open, onClose }) => {
  const [form, setForm] = useState({ username: "", link: "" });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    try {
      const res = await api.post("/admin/generator/generationPage", form);
      if (res.status === 200) {
        navigate("/generationPage", { state: { requestData: res.data } });
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
