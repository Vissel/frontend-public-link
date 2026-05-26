import React, { useEffect, useState } from "react";
import {
    Alert,
    Button,
    Chip,
    Divider,
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
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";
import config from "../api/config";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const contextPath = "/publiclink";

const EnvironmentDetailPage = () => {
    const [searchParams] = useSearchParams();
    const requestUuid = searchParams.get("requestUuid");
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [copiedKey, setCopiedKey] = useState("");
    const navigate = useNavigate();
    const frontendOrigin = window.location.origin;

    const addHostToHref = (contextString) => {
        if (!contextString) return "";
        return /^https?:\/\//i.test(contextString)
            ? contextString
            : `${frontendOrigin}${contextString}`;
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

    useEffect(() => {
        if (!requestUuid) {
            setError("No request UUID provided.");
            setLoading(false);
            return;
        }

        const fetchDetail = async () => {
            try {
                setError("");
                const res = await api.get(
                    `${contextPath}/admin/v1/getEnvironmentDetail`,
                    { params: { requestUuid } }
                );
                setDetail(res.data);
            } catch (err) {
                console.error("Failed to fetch environment detail", err);
                setError("Failed to fetch environment detail.");
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
    }, [requestUuid]);

    if (loading) {
        return (
            <PageContainer maxWidth="md">
                <Typography>Loading...</Typography>
            </PageContainer>
        );
    }

    if (error) {
        return (
            <PageContainer maxWidth="md">
                <Alert severity="error">{error}</Alert>
                <Button sx={{ mt: 2 }} variant="outlined" onClick={() => navigate("/adminHome")}>
                    Back to Admin Home
                </Button>
            </PageContainer>
        );
    }

    return (
        <PageContainer maxWidth="md">
            <Stack spacing={3}>
                <SectionBlock
                    title="Environment Detail"
                    description={`Detail view for request UUID: ${requestUuid}`}
                    action={
                        <Button variant="outlined" onClick={() => navigate("/adminHome")}>
                            Back to Admin Home
                        </Button>
                    }
                >
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Request UUID:
                            </Typography>
                            <Typography variant="body2">{detail?.requestUUID || "-"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Seller Name:
                            </Typography>
                            <Typography variant="body2">{detail?.sellerName || "-"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Product Name:
                            </Typography>
                            <Typography variant="body2">{detail?.productName || "-"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Created At:
                            </Typography>
                            <Typography variant="body2">{detail?.createdAt || "-"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Created By:
                            </Typography>
                            <Typography variant="body2">{detail?.createdBy || "-"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Status:
                            </Typography>
                            <Chip
                                size="small"
                                color={detail?.envStatus ? "success" : "default"}
                                label={detail?.envStatus ? "Active" : "Inactive"}
                                onClick={() => { }}
                                clickable={false}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Seller Auth Link:
                            </Typography>
                            {detail?.sellerAuthLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.sellerAuthLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        underline="hover"
                                    >
                                        Open Link
                                    </Link>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() =>
                                            handleCopyLink("sellerAuth", detail.sellerAuthLink)
                                        }
                                    >
                                        {copiedKey === "sellerAuth" ? "Copied!" : "Copy"}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">-</Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 160 }}>
                                Public Link:
                            </Typography>
                            {detail?.publicLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.publicLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        underline="hover"
                                    >
                                        Open Link
                                    </Link>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() =>
                                            handleCopyLink("public", detail.publicLink)
                                        }
                                    >
                                        {copiedKey === "public" ? "Copied!" : "Copy"}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">-</Typography>
                            )}
                        </Stack>
                    </Stack>
                </SectionBlock>

                <SectionBlock
                    title="Pricing"
                    description="Pricing records associated with this sale environment."
                >
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                        <Typography variant="h6">
                            Total:{" "}
                            {detail?.totalPrice != null
                                ? `${Number(detail.totalPrice).toLocaleString()} ${detail.currency || "VND"}`
                                : "0 VND"}
                        </Typography>
                    </Stack>
                    <Divider sx={{ mb: 2 }} />
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Duration (hours)</TableCell>
                                    <TableCell>Amount</TableCell>
                                    <TableCell>Currency</TableCell>
                                    <TableCell>Created At</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(!detail?.pricings || detail.pricings.length === 0) ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">
                                            No pricing records.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    detail.pricings.map((pricing, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{pricing.durationHours}</TableCell>
                                            <TableCell>
                                                {Number(pricing.amount).toLocaleString()}
                                            </TableCell>
                                            <TableCell>{pricing.currency}</TableCell>
                                            <TableCell>{pricing.createdAt || "-"}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </SectionBlock>

                {detail?.orders && detail.orders.length > 0 && (
                    <SectionBlock
                        title="Orders"
                        description="Orders placed in this sale environment."
                    >
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Buyer Name</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {detail.orders.map((order, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{order.buyerName || "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </SectionBlock>
                )}
            </Stack>
        </PageContainer>
    );
};

export default EnvironmentDetailPage;
