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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

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

      // Step 2: Download using pubApi.get() so the auth interceptor attaches the Bearer token
      const response = await pubApi.get(
        `/api/v1/seller/stream/exportAll/${downloadToken}`,
        { responseType: "blob" }
      );

      const blob = new Blob(
        [response.data],
        { type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from Content-Disposition header if available
      const disposition = response.headers["content-disposition"];
      const filenameMatch = disposition && disposition.match(/filename="?([^";\n]+)"?/);
      a.download = filenameMatch ? filenameMatch[1] : `seller-report-${username}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
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
          t("sellerHome.errors.unableToLoad")
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
            {t("common.loading")}
          </Typography>
        </Stack>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="md">
        <SectionBlock title={t("sellerHome.title")} description={t("sellerHome.errors.loadFailed")}>
          <Alert severity="error">{error}</Alert>
        </SectionBlock>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title={t("sellerHome.title")}
          description={t("sellerHome.subtitle")}
        >
          <Stack spacing={2}>
            {sellerInfo && (
              <Stack spacing={1}>
                <Typography variant="h5">
                  {t("sellerHome.welcome")}
                  {" "}{sellerInfo.name || sellerInfo.username || username}
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Typography variant="body2" color="text.secondary">
                    {t("sellerHome.username")} {sellerInfo.username}
                  </Typography>
                  {sellerInfo.email && (
                    <Typography variant="body2" color="text.secondary">
                      {t("sellerHome.email")} {sellerInfo.email}
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
                {t("sellerHome.welcome")} {username}
              </Typography>
            )}
            <Typography variant="body1" color="text.secondary">
              {t("sellerHome.usePublicLink")}
            </Typography>
          </Stack>
        </SectionBlock>

        {(saleEnvs.length > 0 || total > 0) && (
          <SectionBlock
            title={t("sellerHome.saleEnvironments")}
            description={t("sellerHome.saleEnvironmentsDesc")}
          >
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder={t("sellerHome.searchByProduct")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                sx={{ minWidth: 250 }}
              />
              <Button
                variant="contained"
                onClick={handleExportAll}
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("sellerHome.exportAll")}
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ ml: "auto", whiteSpace: "nowrap" }}>
                {t("sellerHome.total")} {total} | {t("sellerHome.displaying")} {saleEnvs.filter((env) =>
                  !searchText ||
                  (env.productName || "").toLowerCase().includes(searchText.toLowerCase())
                ).length}
              </Typography>
            </Stack>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("sellerHome.requestUuid")}</TableCell>
                    <TableCell>{t("sellerHome.productName")}</TableCell>
                    <TableCell>{t("sellerHome.link")}</TableCell>
                    <TableCell>{t("sellerHome.status")}</TableCell>
                    <TableCell>{t("sellerHome.createdAt")}</TableCell>
                    <TableCell>{t("sellerHome.endedAt")}</TableCell>
                    <TableCell>{t("sellerHome.plannedEndedAt")}</TableCell>
                    <TableCell>{t("sellerHome.orderNumTotal")}</TableCell>
                    <TableCell>{t("sellerHome.export")}</TableCell>
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
                                  ? t("common.copied")
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
                                    ? t("common.copied")
                                    : t("common.copy")}
                                </Button>
                              </Stack>
                            ) : (
                              "\u2014"
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={env.envStatus ? t("common.active") : t("common.inactive")}
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
                              {t("sellerHome.excel")}
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
              {t("sellerHome.noEnvironments")}
            </Typography>
          </CardWrapper>
        )}
      </Stack>
    </PageContainer>
  );
};

export default SellerHome;
