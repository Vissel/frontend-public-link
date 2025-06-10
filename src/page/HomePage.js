// src/HomePage.js (updated)
import React, { useEffect, useState } from "react";
// import { Button, Box } from "@mui/material";

import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext"; // Import useAuth
import api from "../api";

import SellerForm from "../form/SellerForm";
import { Table, Button, Box, Container } from "react-bootstrap";

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, checkAuthStatus } = useAuth(); // Get logout function from context
  const [message, setMessage] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    // You can make an API call to a protected endpoint here
    // to display user-specific data, verifying the session is still active.
    // For example:
    // api.get('/api/user-info').then(res => setMessage(`Hello, ${res.data.username}!`));
    setMessage("Welcome to the Home Page!");
    const state = location.state;
    if (state?.sellerName && state?.publicLink) {
      const newRecord = {
        sellerName: state.sellerName,
        publicLink: state.publicLink,
      };
      setEntries((prev) => [newRecord, ...prev]);
    }
  }, [location.state]);

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      console.log("Logged out successfully");
      navigate("/login");
    } else {
      // Even if logout fails on server, navigate for UX, but log error
      console.error("Logout failed:", result.message);
      navigate("/login");
    }
  };

  return (
    <Container className="mt-4">
      <div className="">
        <Button variant="contained" onClick={() => setOpenDialog(true)}>
          Generate product link
        </Button>
        <Button variant="outlined" sx={{ mt: 2 }}>
          Button B
        </Button>
        <SellerForm open={openDialog} onClose={() => setOpenDialog(false)} />
        <Button onClick={handleLogout}></Button>
      </div>
      {/* 📝 Show record list */}
      <div className="table-responsive">
        {" "}
        {/* Keep this div for responsive table behavior */}
        <Table bordered>
          {" "}
          {/* 'bordered' prop for table-bordered class */}
          <thead className="table-light">
            <tr>
              <th>Seller Name</th>
              <th>Public Link</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="2" className="text-center">
                  No records yet
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => (
                <tr key={idx}>
                  <td>{entry.sellerName}</td>
                  <td>
                    <a
                      href={entry.publicLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {entry.publicLink}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </Container>
  );
};

export default HomePage;
