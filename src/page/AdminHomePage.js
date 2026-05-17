import React, { useEffect, useRef, useState } from "react";
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import api from "../api";
import config from "../api/config";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import SellerForm from "../form/SellerForm";

const DEFAULT_ENTRY_ROWS = 10;
const DEFAULT_USER_ROWS = 10;
const USER_OPTION_PAGE_SIZE = 100;
const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];
const SEARCH_DEBOUNCE_MS = 1000;

const buildSearchRequestConfig = (searchText) => {
  const trimmedSearchText = searchText.trim();

  if (!trimmedSearchText) {
    return undefined;
  }

  return {
    params: {
      search: trimmedSearchText,
    },
  };
};

const buildEnvironmentPaginationPayload = (page, size, filters = {}) => ({
  page: page + 1,
  size,
  listData: [
    {
      createdAt: filters.createdAt || null,
      createdBy: filters.createdBy || null,
      sellerName: filters.sellerName || null,
      requestUuid: filters.requestUuid || null,
    },
  ],
});

const buildUserPaginationPayload = (page, size, filters = {}) => ({
  page,
  size,
  listData: [
    {
      username: filters.username || null,
      name: filters.name || null,
      email: filters.email || null,
      role: filters.role || null,
    },
  ],
});

const fetchEnvironmentPage = async (contextPath, page, size, searchText = "", filters = {}) => {
  const res = await api.post(
    `${contextPath}/admin/v1/getEnvironments`,
    buildEnvironmentPaginationPayload(page, size, filters),
    buildSearchRequestConfig(searchText)
  );

  return {
    items: res.data?.listSaleEnv || [],
    total: res.data?.total || 0,
  };
};

const fetchUserPage = async (contextPath, page, size, searchText = "", filters = {}) => {
  const res = await api.post(
    `${contextPath}/admin/v1/listUser`,
    buildUserPaginationPayload(page, size, filters),
    buildSearchRequestConfig(searchText)
  );

  return {
    items: res.data?.listUser || [],
    total: res.data?.total || 0,
  };
};

const fetchAllUserOptions = async (contextPath) => {
  let page = 0;
  let total = 0;
  let collectedUsers = [];

  do {
    const { items, total: nextTotal } = await fetchUserPage(
      contextPath,
      page,
      USER_OPTION_PAGE_SIZE
    );
    total = nextTotal;
    collectedUsers = [...collectedUsers, ...items];
    page += 1;
  } while (collectedUsers.length < total && total > 0);

  return collectedUsers;
};

const AdminHomePage = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [entries, setEntries] = useState([]);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryPage, setEntryPage] = useState(0);
  const [entryRowsPerPage, setEntryRowsPerPage] = useState(DEFAULT_ENTRY_ROWS);
  const [entrySearchText, setEntrySearchText] = useState("");
  const [entryAppliedSearchText, setEntryAppliedSearchText] = useState("");
  const [filterCreatedBy, setFilterCreatedBy] = useState("");
  const [filterSellerName, setFilterSellerName] = useState("");
  const [filterRequestUuid, setFilterRequestUuid] = useState("");
  const [appliedFilterCreatedBy, setAppliedFilterCreatedBy] = useState("");
  const [appliedFilterSellerName, setAppliedFilterSellerName] = useState("");
  const [appliedFilterRequestUuid, setAppliedFilterRequestUuid] = useState("");
  const [users, setUsers] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [userPage, setUserPage] = useState(0);
  const [userRowsPerPage, setUserRowsPerPage] = useState(DEFAULT_USER_ROWS);
  const [userSearchText, setUserSearchText] = useState("");
  const [userAppliedSearchText, setUserAppliedSearchText] = useState("");
  const [filterUsername, setFilterUsername] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [appliedFilterUsername, setAppliedFilterUsername] = useState("");
  const [appliedFilterName, setAppliedFilterName] = useState("");
  const [appliedFilterEmail, setAppliedFilterEmail] = useState("");
  const [appliedFilterRole, setAppliedFilterRole] = useState("");
  const [userTotal, setUserTotal] = useState(0);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userError, setUserError] = useState("");
  const contextPath = "/publiclink";
  const currentHost = `${config.baseURL}${contextPath}`;
  const previousEntrySearchRef = useRef(entryAppliedSearchText);
  const previousUserSearchRef = useRef(userAppliedSearchText);

  const addHostToHref = (contextString) => {
    if (!contextString) {
      return "";
    }

    return /^https?:\/\//i.test(contextString)
      ? contextString
      : `${currentHost}${contextString}`;
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setEntryAppliedSearchText(entrySearchText);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [entrySearchText]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAppliedFilterCreatedBy(filterCreatedBy);
      setAppliedFilterSellerName(filterSellerName);
      setAppliedFilterRequestUuid(filterRequestUuid);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [filterCreatedBy, filterSellerName, filterRequestUuid]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setUserAppliedSearchText(userSearchText);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [userSearchText]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAppliedFilterUsername(filterUsername);
      setAppliedFilterName(filterName);
      setAppliedFilterEmail(filterEmail);
      setAppliedFilterRole(filterRole);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [filterUsername, filterName, filterEmail, filterRole]);

  useEffect(() => {
    const loadEntries = async () => {
      try {
        setError("");
        const { items, total } = await fetchEnvironmentPage(
          contextPath,
          entryPage,
          entryRowsPerPage,
          entryAppliedSearchText,
          {
            createdBy: appliedFilterCreatedBy || null,
            sellerName: appliedFilterSellerName || null,
            requestUuid: appliedFilterRequestUuid || null,
          }
        );
        setEntries(items);
        setEntryTotal(total);
      } catch (err) {
        console.error("Failed to fetch records", err);
        setError("Failed to fetch product link records.");
      }
    };

    const didSearchChange =
      previousEntrySearchRef.current !== entryAppliedSearchText;

    if (didSearchChange && entryPage !== 0) {
      previousEntrySearchRef.current = entryAppliedSearchText;
      setEntryPage(0);
      return;
    }

    previousEntrySearchRef.current = entryAppliedSearchText;
    loadEntries();
  }, [contextPath, entryAppliedSearchText, entryPage, entryRowsPerPage, appliedFilterCreatedBy, appliedFilterSellerName, appliedFilterRequestUuid]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setUserError("");
        const { items, total } = await fetchUserPage(
          contextPath,
          userPage,
          userRowsPerPage,
          userAppliedSearchText,
          {
            username: appliedFilterUsername || null,
            name: appliedFilterName || null,
            email: appliedFilterEmail || null,
            role: appliedFilterRole || null,
          }
        );
        setUsers(items);
        setUserTotal(total);
      } catch (err) {
        console.error("Failed to fetch users", err);
        setUserError("Failed to fetch user records.");
      }
    };

    const didSearchChange =
      previousUserSearchRef.current !== userAppliedSearchText;

    if (didSearchChange && userPage !== 0) {
      previousUserSearchRef.current = userAppliedSearchText;
      setUserPage(0);
      return;
    }

    previousUserSearchRef.current = userAppliedSearchText;
    loadUsers();
  }, [contextPath, userAppliedSearchText, userPage, userRowsPerPage, appliedFilterUsername, appliedFilterName, appliedFilterEmail, appliedFilterRole]);

  useEffect(() => {
    const loadUserOptions = async () => {
      try {
        const items = await fetchAllUserOptions(contextPath);
        setUserOptions(items);
      } catch (err) {
        console.error("Failed to fetch users for seller form", err);
      }
    };

    loadUserOptions();
  }, [contextPath]);

  const handleSellerFormSuccess = async ({ message }) => {
    setSuccessMessage(message || "Generated seller environment successfully.");

    if (entryPage !== 0) {
      setEntryPage(0);
      return;
    }

    try {
      setError("");
      const { items, total } = await fetchEnvironmentPage(
        contextPath,
        0,
        entryRowsPerPage,
        entryAppliedSearchText,
        {
          createdBy: appliedFilterCreatedBy || null,
          sellerName: appliedFilterSellerName || null,
          requestUuid: appliedFilterRequestUuid || null,
        }
      );
      setEntries(items);
      setEntryTotal(total);
    } catch (err) {
      console.error("Failed to refresh records", err);
      setError("Generated successfully, but failed to refresh product link records.");
    }
  };

  const handleEntrySearchKeyDown = (event) => {
    if (event.key === "Enter") {
      setEntryAppliedSearchText(entrySearchText);
    }
  };

  const handleUserSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      setUserAppliedSearchText(userSearchText);
    }
  };

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title="Admin Workspace"
          description="Manage seller authentication links and public product pages from a single responsive MUI dashboard."
          action={
            <Button
              variant="contained"
              onClick={() => {
                setSuccessMessage("");
                setOpenDialog(true);
              }}
            >
              Generate product link
            </Button>
          }
        >
          {successMessage && (
            <Alert severity="success">{successMessage}</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            The table below is fully responsive and uses MUI components only.
          </Typography>
        </SectionBlock>

        <SellerForm
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          onSuccess={handleSellerFormSuccess}
          users={userOptions}
        />

        <SectionBlock
          title="Generated Links"
          description={`Each record keeps the seller authentication link and the public customer-facing order page. Total records: ${entryTotal}.`}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Created By"
              size="small"
              value={filterCreatedBy}
              onChange={(e) => setFilterCreatedBy(e.target.value)}
              onKeyDown={handleEntrySearchKeyDown}
              fullWidth
            />
            <TextField
              label="Seller Name"
              size="small"
              value={filterSellerName}
              onChange={(e) => setFilterSellerName(e.target.value)}
              onKeyDown={handleEntrySearchKeyDown}
              fullWidth
            />
            <TextField
              label="Request UUID"
              size="small"
              value={filterRequestUuid}
              onChange={(e) => setFilterRequestUuid(e.target.value)}
              onKeyDown={handleEntrySearchKeyDown}
              fullWidth
            />
            <TextField
              label="Search generated links"
              placeholder="Search after typing stops"
              value={entrySearchText}
              onChange={(event) => setEntrySearchText(event.target.value)}
              onKeyDown={handleEntrySearchKeyDown}
              size="small"
              fullWidth
              disabled
            />
          </Stack>
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
                      <TableCell>{entry.sellerName}</TableCell>
                      <TableCell>{entry.productName}</TableCell>
                      <TableCell>
                        <Link
                          href={addHostToHref(entry.sellerAuthLink)}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                        >
                          Seller Authentication Link
                        </Link>
                      </TableCell>
                      <TableCell>{entry.sellerAuthLinkExpire}</TableCell>
                      <TableCell>{entry.requestUUID}</TableCell>
                      <TableCell>
                        <Link
                          href={addHostToHref(entry.publicLink)}
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
          <TablePagination
            component="div"
            count={entryTotal}
            page={entryPage}
            onPageChange={(_, nextPage) => setEntryPage(nextPage)}
            rowsPerPage={entryRowsPerPage}
            onRowsPerPageChange={(event) => {
              setEntryRowsPerPage(Number(event.target.value));
              setEntryPage(0);
            }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </SectionBlock>

        <SectionBlock
          title="User List"
          description={`Internal user accounts returned from /listUser. Total users: ${userTotal}.`}
        >
          {userError && <Alert severity="error">{userError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Username"
              size="small"
              value={filterUsername}
              onChange={(e) => setFilterUsername(e.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              fullWidth
            />
            <TextField
              label="Name"
              size="small"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              fullWidth
            />
            <TextField
              label="Email"
              size="small"
              value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              fullWidth
            />
            <TextField
              label="Role"
              size="small"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              fullWidth
            />
            <TextField
              label="Search users"
              placeholder="Search after typing stops"
              value={userSearchText}
              onChange={(event) => setUserSearchText(event.target.value)}
              onKeyDown={handleUserSearchKeyDown}
              size="small"
              fullWidth
            />
          </Stack>
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
          <TablePagination
            component="div"
            count={userTotal}
            page={userPage}
            onPageChange={(_, nextPage) => setUserPage(nextPage)}
            rowsPerPage={userRowsPerPage}
            onRowsPerPageChange={(event) => {
              setUserRowsPerPage(Number(event.target.value));
              setUserPage(0);
            }}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </SectionBlock>
      </Stack>
    </PageContainer>
  );
};

export default AdminHomePage;
