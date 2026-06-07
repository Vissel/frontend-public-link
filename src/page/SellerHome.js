import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
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
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";

const DEFAULT_ROWS_PER_PAGE = 10;
const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];

const SellerHome = () => {
  const [username, setUsername] = useState("");
  const [sellerInfo, setSellerInfo] = useState(null);
  const [saleEnvs, setSaleEnvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const frontendOrigin = window.location.origin;

  const fallbackCopy = (text, onDone) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = 0;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      onDone();
    } catch (e) {
      console.error("Copy failed", e);
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const handleCopyLink = (key, value) => {
    const text = addHostToHref(value);
    if (!text) return;
    const markCopied = () => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(markCopied)
        .catch(() => fallbackCopy(text, markCopied));
    } else {
      fallbackCopy(text, markCopied);
    }
  };

  const handleCopyText = (key, text) => {
    if (!text) return;
    const markCopied = () => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(markCopied)
        .catch(() => fallbackCopy(text, markCopied));
    } else {
      fallbackCopy(text, markCopied);
    }
  };

  const addHostToHref = (link) => {
    if (!link) {
      return "";
    }

    return /^https?:\/\//i.test(link)
      ? link
      : `${frontendOrigin}${link}`;
  };

  const handleExport = async (requestUUID) => {
    if (!requestUUID) return;
    try {
      const response = await pubApi.post(
        "/api/v1/seller/export",
        { requestUUID },
        { responseType: "blob" }
      );
      const blob = new Blob(
        [response.data],
        { type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${requestUUID}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  /**
   * Two-step streaming export pattern:
   * 1. POST /exportAllToken → send params, get download token
   * 2. GET /stream/exportAll/{token} → stream the Excel file
   * 
   * This avoids buffering the entire file in memory and supports
   * large exports that would otherwise timeout or consume too much RAM.
   */
  const handleExportAll = async () => {
    try {
      // Step 1: Get download token
      const tokenResponse = await pubApi.post("/api/v1/seller/getExportToken", {
        sellerName: username,
      });
      const downloadToken = tokenResponse.data?.downloadToken;
      if (!downloadToken) {
        console.error("No download token received");
        return;
      }

      // Step 2: Stream download using the token
      const streamUrl = `${pubApi.defaults.baseURL}/api/v1/seller/stream/exportAll/${downloadToken}`;

      // Create a temporary anchor to trigger download
      const a = document.createElement("a");
      a.href = streamUrl;
      a.download = ""; // Let server determine filename from Content-Disposition
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Export all failed", err);
    }
  };

  const navigate = useNavigate();
  const { state } = useLocation();
  const auth = useAuth();

  useEffect(() => {
    const sellerName = state?.username || auth.username || "";
    setUsername(sellerName);

    if (!sellerName) {
      setLoading(false);
      return;
    }

    const fetchSellerData = async () => {
      try {
        const [infoRes, listRes] = await Promise.all([
          pubApi.post("/api/v1/seller/getInfo", { username: sellerName }),
          pubApi.post("/api/v1/seller/listRequest", {
            page: page + 1,
            size: rowsPerPage,
            listData: [{ sellerName }],
          }),
        ]);

        if (infoRes.status === 200) {
          setSellerInfo(infoRes.data);
        }
        if (listRes.status === 200) {
          setSaleEnvs(listRes.data.listSaleEnv || []);
          setTotal(listRes.data.total || 0);
        }
      } catch (err) {
        console.error("Seller data fetch failed:", err);
        setError(
          err?.response?.data?.message ||
          "Unable to load seller information."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSellerData();
  }, [state, username, page, rowsPerPage]);

  if (loading) {
    return (
      <PageContainer maxWidth="md">
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          justifyContent="center"
          sx={{ py: 8 }}
        >
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Stack>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="md">
        <SectionBlock title="Seller Home" description="Unable to load seller data.">
          <Alert severity="error">{error}</Alert>
        </SectionBlock>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title="Seller Home"
          description="Your seller profile and sale environments."
        >
          <Stack spacing={2}>
            {sellerInfo && (
              <Stack spacing={1}>
                <Typography variant="h5">
                  Welcome,
                  {" "}{sellerInfo.name || sellerInfo.username || username}
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Typography variant="body2" color="text.secondary">
                    Username: {sellerInfo.username}
                  </Typography>
                  {sellerInfo.email && (
                    <Typography variant="body2" color="text.secondary">
                      Email: {sellerInfo.email}
                    </Typography>
                  )}
                  {sellerInfo.role && (
                    <Chip
                      label={sellerInfo.role}
                      size="small"
                      color="primary"
                      variant="outlined"
                      onClick={() => { }}
                      clickable={false}
                    />
                  )}
                </Stack>
              </Stack>
            )}
            {!sellerInfo && username && (
              <Typography variant="h5">
                Welcome, {username}
              </Typography>
            )}
            <Typography variant="body1" color="text.secondary">
              Use the public link provided to manage customer orders from mobile or
              desktop.
            </Typography>
          </Stack>
        </SectionBlock>

        {(saleEnvs.length > 0 || total > 0) && (
          <SectionBlock
            title="Sale Environments"
            description="Your active and past sale environments."
          >
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder="Search by Product Name"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                sx={{ minWidth: 250 }}
              />
              <Button
                variant="contained"
                onClick={handleExportAll}
                sx={{ whiteSpace: "nowrap" }}
              >
                Export All
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ ml: "auto", whiteSpace: "nowrap" }}>
                Total: {total} | Displaying: {saleEnvs.filter((env) =>
                  !searchText ||
                  (env.productName || "").toLowerCase().includes(searchText.toLowerCase())
                ).length}
              </Typography>
            </Stack>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Request UUID</TableCell>
                    <TableCell>Product Name</TableCell>
                    <TableCell>Link</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created At</TableCell>
                    <TableCell>Ended At</TableCell>
                    <TableCell>Planned Ended At</TableCell>
                    <TableCell>Order Num/Total</TableCell>
                    <TableCell>Export</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saleEnvs
                    .filter((env) =>
                      !searchText ||
                      (env.productName || "").toLowerCase().includes(searchText.toLowerCase())
                    )
                    .map((env, idx) => {
                      const uuid = env.requestUUID || "";
                      const last4 = uuid.slice(-4);
                      return (
                        <TableRow
                          key={uuid || idx}
                          hover
                          onClick={() => {
                            if (env.publicLink) {
                              navigate(env.publicLink);
                            }
                          }}
                          sx={{ cursor: env.publicLink ? "pointer" : "default" }}
                        >
                          <TableCell
                            onClick={(e) => {
                              if (uuid) {
                                e.stopPropagation();
                                handleCopyText(`uuid-${uuid}`, uuid);
                              }
                            }}
                          >
                            {last4 ? (
                              <a
                                title={`Click to copy: ${uuid}`}
                                style={{
                                  textDecoration: "underline",
                                  cursor: "pointer",
                                }}
                              >
                                {copiedKey === `uuid-${uuid}`
                                  ? "Copied!"
                                  : last4}
                              </a>
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>{env.productName || "\u2014"}</TableCell>
                          <TableCell
                            sx={{
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {env.publicLink ? (
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                <Link
                                  href={addHostToHref(env.publicLink)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  underline="hover"
                                  title={`Open ${addHostToHref(env.publicLink)}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Link
                                </Link>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyLink(
                                      `pub-${env.requestUUID || idx}`,
                                      env.publicLink
                                    );
                                  }}
                                  sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                >
                                  {copiedKey ===
                                    `pub-${env.requestUUID || idx}`
                                    ? "Copied!"
                                    : "Copy"}
                                </Button>
                              </Stack>
                            ) : (
                              "\u2014"
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={env.envStatus ? "Active" : "Inactive"}
                              size="small"
                              color={env.envStatus ? "success" : "default"}
                              onClick={() => { }}
                              clickable={false}
                            />
                          </TableCell>
                          <TableCell>{env.createdAt || "\u2014"}</TableCell>
                          <TableCell>{env.endedAt || "\u2014"}</TableCell>
                          <TableCell>{env.plannedEndedAt || "\u2014"}</TableCell>
                          <TableCell>
                            {env.orderTotal != null || env.totalProductQuantity != null
                              ? `${env.orderTotal ?? 0}/${env.totalProductQuantity ?? 0}`
                              : "\u2014"}
                          </TableCell>
                          <TableCell
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExport(env.requestUUID);
                            }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{ minWidth: 60, fontSize: "0.7rem" }}
                            >
                              Excel
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(Number(event.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            />
          </SectionBlock>
        )}

        {saleEnvs.length === 0 && total === 0 && (
          <CardWrapper>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
              No sale environments found. Contact an administrator to set up your public link.
            </Typography>
          </CardWrapper>
        )}
      </Stack>
    </PageContainer>
  );
};

export default SellerHome;
