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
  TableRow,
  Typography,
} from "@mui/material";
import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { pubApi, CONTEXT_PATH } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";

const SellerHome = () => {
  const [username, setUsername] = useState("");
  const [sellerInfo, setSellerInfo] = useState(null);
  const [saleEnvs, setSaleEnvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
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

  const addHostToHref = (link) => {
    if (!link) {
      return "";
    }

    return /^https?:\/\//i.test(link)
      ? link
      : `${frontendOrigin}${link}`;
  };

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
            page: 1,
            size: 10,
            listData: [{ sellerName }],
          }),
        ]);

        if (infoRes.status === 200) {
          setSellerInfo(infoRes.data);
        }
        if (listRes.status === 200) {
          setSaleEnvs(listRes.data.listSaleEnv || []);
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
  }, [state, username]);

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
    <PageContainer maxWidth="md">
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

        {saleEnvs.length > 0 && (
          <SectionBlock
            title="Sale Environments"
            description="Your active and past sale environments."
          >
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Seller Name</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Public Link</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saleEnvs.map((env, idx) => (
                    <TableRow key={env.requestUUID || idx}>
                      <TableCell>{env.sellerName}</TableCell>
                      <TableCell>{env.productName || "—"}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {env.publicLink ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Link
                              href={addHostToHref(env.publicLink)}
                              target="_blank"
                              rel="noopener noreferrer"
                              underline="hover"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Link
                            </Link>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleCopyLink(`pub-${env.requestUUID || idx}`, env.publicLink)}
                              sx={{ minWidth: 60, fontSize: "0.7rem" }}
                            >
                              {copiedKey === `pub-${env.requestUUID || idx}` ? "Copied!" : "Copy"}
                            </Button>
                          </Stack>
                        ) : ("—")}
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
                      <TableCell>{env.createdAt || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionBlock>
        )}

        {saleEnvs.length === 0 && (
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
