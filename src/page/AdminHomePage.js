import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import api from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import SellerForm from "../form/SellerForm";

const AdminHomePage = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [error, setError] = useState("");
  const [userError, setUserError] = useState("");

  const currentHost = `${window.location.protocol}//${window.location.host}/ban-hang/#/`;
  const apiPublicLink = "public/link?token=";
  const contextPath = '/publiclink';
  const fetchEntries = async () => {
    try {
      setError("");
      const paginationPayload = {
        page: 0,
        size: 100,
        listData: [
          {
            createdAt:""
          }
        ],
      }
      const res = await api.post(`${contextPath}/admin/v1/getAllEnvironment`,paginationPayload);
      if (res.status === 200) {
        setEntries(res.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch records", err);
      setError("Failed to fetch product link records.");
    }
  };

  const fetchUsers = async () => {
    try {
      setUserError("");
      const res = await api.post(`${contextPath}/admin/v1/listUser`, {
        page: 0,
        size: 100,
        listData: [{
          byRole:""
        }],
      });

      if (res.status === 200) {
        setUsers(res.data?.listUser || []);
        setUserTotal(res.data?.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
      setUserError("Failed to fetch user records.");
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchUsers();
  }, []);

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title="Admin Workspace"
          description="Manage seller authentication links and public product pages from a single responsive MUI dashboard."
          action={
            <Button variant="contained" onClick={() => setOpenDialog(true)}>
              Generate product link
            </Button>
          }
        >
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            The table below is fully responsive and uses MUI components only.
          </Typography>
        </SectionBlock>

        <SellerForm
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          onSuccess={fetchEntries}
        />

        <SectionBlock
          title="Generated Links"
          description="Each record keeps the seller authentication link and the public customer-facing order page."
        >
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Created At</TableCell>
                  <TableCell>Seller Name</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Seller Authentication</TableCell>
                  <TableCell>Seller Authentication Expire</TableCell>
                  <TableCell>Request UUID</TableCell>
                  <TableCell>Public Link</TableCell>
                  <TableCell>Created By</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={9} align="center">
                    No records yet.
                  </TableCell>
                </TableRow>
                ) : (
                  entries.map((entry, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>{entry.createdAt}</TableCell>
                      <TableCell>
                        <Link
                          href={entry.sellerLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          {entry.sellerName}
                        </Link>
                      </TableCell>
                      <TableCell>{entry.productName}</TableCell>
                      <TableCell>
                        <Link
                          href={`${currentHost}${entry.sellerAuthLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          Seller Authentication Link
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`${currentHost}${entry.sellerAuthLinkExpire}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          Seller Authentication Link expire
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`${currentHost}${entry.requestUUID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          Request UUID
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`${currentHost}${apiPublicLink}${entry.publicLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          Public Link
                        </Link>
                      </TableCell>
                      <TableCell>{entry.createdBy}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={entry.envStatus ? "success" : "default"}
                          label={entry.envStatus ? "Active" : "Inactive"}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionBlock>

        <SectionBlock
          title="User List"
          description={`Internal user accounts returned from /listUser. Total users: ${userTotal}.`}
        >
          {userError && <Alert severity="error">{userError}</Alert>}
          <TableContainer
            sx={{
              overflowX: "auto",
              maxHeight: 360,
            }}
          >
            <Table stickyHeader sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user, idx) => (
                    <TableRow key={`${user.username || "user"}-${idx}`} hover>
                      <TableCell>{user.username || "-"}</TableCell>
                      <TableCell>{user.name || "-"}</TableCell>
                      <TableCell>{user.email || "-"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={user.role === "SELLER" ? "primary" : "default"}
                          label={user.role || "Unknown"}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionBlock>
      </Stack>
    </PageContainer>
  );
};

export default AdminHomePage;
