import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  SvgIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import api from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const ArrowUpIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
  </SvgIcon>
);

const ArrowDownIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
  </SvgIcon>
);

const CONTEXT_PATH = "/publiclink";
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 500;

// ── API helpers ───────────────────────────────────────────────────────────────

const fetchSellers = async (search, page, size) => {
  const res = await api.get(`${CONTEXT_PATH}/admin/v1/notify/sellers`, {
    params: { search: search || undefined, page, size },
  });
  return {
    sellers: res.data?.sellers || [],
    total: res.data?.total || 0,
  };
};

const fetchSellerEnvironments = async (username) => {
  const res = await api.get(
    `${CONTEXT_PATH}/admin/v1/notify/sellers/${username}/environments`
  );
  const sellers = res.data?.sellers || [];
  return sellers.length > 0 ? sellers[0].environments || [] : [];
};

const sendNotification = async (payload) => {
  const res = await api.post(`${CONTEXT_PATH}/admin/v1/notify/send`, payload);
  return res.data;
};

// ─ Expandable seller row ─────────────────────────────────────────────────────

function SellerRow({
  seller,
  isSelected,
  onToggle,
  selectedEnvs,
  onEnvChange,
}) {
  const [open, setOpen] = useState(false);
  const [envs, setEnvs] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    const next = !open;
    setOpen(next);
    if (next && envs === null) {
      setLoading(true);
      try {
        const data = await fetchSellerEnvironments(seller.username);
        setEnvs(data);
      } catch (err) {
        console.error("Failed to load environments", err);
        setEnvs([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleToggleEnv = (reqUuid) => {
    const current = selectedEnvs || [];
    const next = current.includes(reqUuid)
      ? current.filter((u) => u !== reqUuid)
      : [...current, reqUuid];
    onEnvChange(seller.username, next);
  };

  const allEnvSelected =
    envs && envs.length > 0 && selectedEnvs && selectedEnvs.length === envs.length;

  const handleToggleAllEnvs = () => {
    if (allEnvSelected) {
      onEnvChange(seller.username, []);
    } else {
      onEnvChange(seller.username, envs.map((e) => e.requestUuid));
    }
  };

  return (
    <React.Fragment>
      <TableRow
        hover
        sx={{
          cursor: "pointer",
          bgcolor: isSelected ? "action.selected" : "inherit",
        }}
        onClick={() => onToggle(seller.username)}
      >
        <TableCell padding="checkbox" sx={{ width: 48 }}>
          <Checkbox
            checked={isSelected}
            size="small"
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(seller.username)}
          />
        </TableCell>
        <TableCell>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleExpand(); }}>
            {open ? <ArrowUpIcon fontSize="small" /> : <ArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {seller.name || seller.username}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            @{seller.username}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Chip
            size="small"
            label={seller.environmentCount}
            sx={{ height: 22, fontSize: "0.75rem" }}
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={4} sx={{ pl: 6, pr: 2, pb: 2, pt: 0 }}>
            {loading ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Loading environments...
                </Typography>
              </Stack>
            ) : envs && envs.length > 0 ? (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" sx={{ width: 40 }}>
                        <Checkbox
                          size="small"
                          checked={allEnvSelected}
                          indeterminate={selectedEnvs && selectedEnvs.length > 0 && !allEnvSelected}
                          onChange={handleToggleAllEnvs}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell sx={{ width: 160 }}>Created At</TableCell>
                      <TableCell align="center" sx={{ width: 80 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {envs.map((env) => {
                      const envChecked = selectedEnvs && selectedEnvs.includes(env.requestUuid);
                      const displayName = env.productName
                        ? `${env.productName} (${env.requestUuid.slice(-6)})`
                        : env.requestUuid;
                      return (
                        <TableRow
                          key={env.requestUuid}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => handleToggleEnv(env.requestUuid)}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={envChecked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => handleToggleEnv(env.requestUuid)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
                              {displayName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {env.createdAt || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {env.active ? (
                              <Chip
                                size="small"
                                label="Active"
                                color="success"
                                sx={{ height: 22, fontSize: "0.7rem" }}
                              />
                            ) : (
                              <Tooltip
                                title={env.endedAt ? `Ended: ${env.endedAt}` : "Ended"}
                                arrow
                              >
                                <Chip
                                  size="small"
                                  label="Inactive"
                                  color="default"
                                  sx={{ height: 22, fontSize: "0.7rem" }}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No environments found for this seller.
              </Typography>
            )}
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────────────────

const NotificationPage = () => {
  const [sellers, setSellers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingSellers, setLoadingSellers] = useState(true);

  const [selectedSellers, setSelectedSellers] = useState({});
  const [sellerEnvironments, setSellerEnvironments] = useState({});
  const [selectAll, setSelectAll] = useState(false);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const searchTimerRef = useRef(null);

  // ── Load sellers ──────────────────────────────────────────────────────────
  const loadSellers = useCallback(async () => {
    setLoadingSellers(true);
    try {
      const { sellers: data, total: t } = await fetchSellers(
        appliedSearch,
        page,
        PAGE_SIZE
      );
      setSellers(data);
      setTotal(t);
    } catch (err) {
      console.error("Failed to load sellers", err);
      setError("Failed to load seller list.");
    } finally {
      setLoadingSellers(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAppliedSearch(searchText.trim() || "");
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

  // ── Seller selection ──────────────────────────────────────────────────────
  const handleToggleSeller = useCallback((username) => {
    setSelectedSellers((prev) => {
      const next = { ...prev };
      if (next[username]) {
        delete next[username];
      } else {
        next[username] = true;
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectAll((prev) => {
      const next = !prev;
      if (next) {
        // Select all sellers on current page
        const all = {};
        sellers.forEach((s) => { all[s.username] = true; });
        setSelectedSellers(all);
      } else {
        setSelectedSellers({});
        setSellerEnvironments({});
      }
      return next;
    });
  }, [sellers]);

  const handleEnvChange = useCallback((username, envs) => {
    setSellerEnvironments((prev) => ({ ...prev, [username]: envs }));
  }, []);

  const selectedCount = Object.keys(selectedSellers).length;

  // ─ Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setError("");
    setSuccess("");

    if (!title.trim()) { setError("Title is required."); return; }
    if (!message.trim()) { setError("Message is required."); return; }
    if (!selectAll && selectedCount === 0) {
      setError("Select at least one seller or use 'Select All'.");
      return;
    }

    setConfirmOpen(false);
    setLoading(true);

    try {
      const targets = selectAll
        ? []
        : Object.keys(selectedSellers).map((username) => ({
          sellerUsername: username,
          requestUuids: sellerEnvironments[username] || [],
        }));

      await sendNotification({
        title: title.trim(),
        message: message.trim(),
        selectAll,
        targets,
      });

      setSuccess(
        `Notification sent to ${selectAll ? "all sellers" : `${selectedCount} seller(s)`} successfully.`
      );
      setTitle("");
      setMessage("");
      setSelectedSellers({});
      setSellerEnvironments({});
      setSelectAll(false);
    } catch (err) {
      console.error("Failed to send notification", err);
      setError(err?.response?.data?.errorMessage || "Failed to send notification.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setTitle("");
    setMessage("");
    setSelectedSellers({});
    setSellerEnvironments({});
    setSelectAll(false);
    setError("");
    setSuccess("");
  };

  // ── Check if all sellers on current page are selected ─────────────────────
  const allOnPageSelected =
    sellers.length > 0 && sellers.every((s) => selectedSellers[s.username]);

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title="Send Notification"
          description="Compose and deliver notifications to sellers. Search, select recipients, and optionally scope to specific environments."
        >
          {success && <Alert severity="success">{success}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: "column", lg: "row" }} spacing={3}>
            {/* ── Left: Seller List ─────────────────────────────────────────── */}
            <Box sx={{ flex: { lg: "0 0 45%" }, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Recipients
                </Typography>

                {/* Search */}
                <TextField
                  label="Search sellers"
                  placeholder="Search by username or name..."
                  size="small"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  fullWidth
                />

                {/* Select All */}
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Checkbox
                    checked={allOnPageSelected}
                    size="small"
                    onChange={handleSelectAll}
                  />
                  <Typography variant="body2">
                    {selectAll ? "All sellers selected" : "Select all on this page"}
                  </Typography>
                  {selectedCount > 0 && !selectAll && (
                    <Chip size="small" color="primary" label={`${selectedCount} selected`} />
                  )}
                </Stack>

                {/* Selected sellers chips */}
                {selectedCount > 0 && !selectAll && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {Object.keys(selectedSellers).map((username) => (
                      <Chip
                        key={username}
                        size="small"
                        label={username}
                        onDelete={() => handleToggleSeller(username)}
                      />
                    ))}
                  </Stack>
                )}

                {/* Seller Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" sx={{ width: 48 }} />
                        <TableCell sx={{ width: 40 }} />
                        <TableCell>Seller</TableCell>
                        <TableCell align="center" sx={{ width: 80 }}>
                          Env
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loadingSellers ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                            <CircularProgress size={24} />
                          </TableCell>
                        </TableRow>
                      ) : sellers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              No sellers found.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        sellers.map((seller) => (
                          <SellerRow
                            key={seller.username}
                            seller={seller}
                            isSelected={!!selectedSellers[seller.username] || selectAll}
                            onToggle={handleToggleSeller}
                            selectedEnvs={sellerEnvironments[seller.username] || []}
                            onEnvChange={handleEnvChange}
                          />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Pagination */}
                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={PAGE_SIZE}
                  onRowsPerPageChange={() => { }}
                  rowsPerPageOptions={[PAGE_SIZE]}
                  labelRowsPerPage="Per page"
                />
              </Stack>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", lg: "block" } }} />

            {/* ── Right: Compose Message ────────────────────────────────────── */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Compose Message
                </Typography>

                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  fullWidth
                  required
                  inputProps={{ maxLength: 200 }}
                  helperText={`${title.length}/200`}
                />

                <TextField
                  label="Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  fullWidth
                  required
                  multiline
                  minRows={8}
                  maxRows={16}
                  placeholder="Type your notification message here..."
                />

                <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 1 }}>
                  <Button variant="outlined" onClick={handleClear}>
                    Clear
                  </Button>
                  <Button
                    variant="contained"
                    disabled={loading}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {loading ? "Sending..." : "Send Notification"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </SectionBlock>

        {/* Confirmation Dialog */}
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Confirm Send</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {selectAll
                ? "This will send the notification to ALL sellers. Continue?"
                : `This will send the notification to ${selectedCount} seller(s). Continue?`}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} variant="contained" autoFocus>
              Confirm & Send
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </PageContainer>
  );
};

export default NotificationPage;
