// src/HomePage.js (updated)
import React, { useEffect, useState } from "react";
// import { Button, Box } from "@mui/material";
import { format, parseISO, toDate } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext"; // Import useAuth
import api from "../api";

import SellerForm from "../form/SellerForm";
import { Table, Button, Row, Container, Col } from "react-bootstrap";

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, checkAuthStatus } = useAuth(); // Get logout function from context
  const [message, setMessage] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [entries, setEntries] = useState([]);
  
  const currentHost = `${window.location.protocol}//${window.location.hostname}/ban-hang/#/`;
  const apiPublicLink ='public/link?token=';
  const fetchEntries = async () => {
    try {
      const res = await api.get("/admin/generator/home");
      if (res.status === 200) {
        
        setEntries(res.data || []);
        
        // const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    } catch (err) {
      console.error("Failed to fetch records", err);
    }
  };

  useEffect(() => {
    setMessage("Welcome to the Home Page!");
    fetchEntries();
   
  }, []);
  const handleAddRecord = (newRecord) => {
    setEntries((prev) => [newRecord, ...prev]);
  };
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
    <Container className="mt-4" fluid="md">
      {/* SellerForm */}
      <Row style={styles.cusMargin} >
        <Col>
        <Button variant="primary" onClick={() => setOpenDialog(true)}>
          Generate product link
        </Button>
        </Col>
        <SellerForm
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          onSuccess={handleAddRecord}
        />
        <Button hidden onClick={handleLogout}>Logout</Button>
      </Row>
      {/* 📝 Show record list */}
      <Row >
        {" "}
        {/* Keep this div for responsive table behavior */}
        <Table responsive="sm" bordered>
          {" "}
          {/* 'bordered' prop for table-bordered class */}
          <thead className="table-light">
            <tr>
              <th >Created At</th>
              <th>Seller Name</th>
              <th>Product Name</th>
              <th>Seller Authentication</th>
              <th>Public Link</th>
              <th>Created By</th>
              <th>Status</th>
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
                  <td>{entry.createdAt}
                  </td>
                  <td>
                    <a
                      href={entry.sellerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {entry.sellerName}{" "}
                    </a>
                  </td>
                  <td>{entry.productName}</td>
                  <td>
                    <a
                      href={currentHost+entry.sellerAuthLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Seller Authentication Link
                    </a>
                  </td>
                  <td>
                    <a
                      href={currentHost+apiPublicLink+entry.publicLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Public Link
                    </a>
                  </td>
                  <td>{entry.createdBy}</td>
                  <td>{entry.envStatus ? "Active" : "In-active"}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Row>
    </Container>
  );
};
const styles = {
    cusMargin: {
        margin: "0 0 10px 0"
    }
}
export default HomePage;
