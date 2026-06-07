import React, { useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    Grid,
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
import { CountdownBadge } from "../components/CountdownTimer";

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
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Request UUID:
                            </Typography>
                            <Typography variant="body2">{detail?.requestUUID || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Request ID:
                            </Typography>
                            <Typography variant="body2">{detail?.requestId || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Seller Name:
                            </Typography>
                            <Typography variant="body2">{detail?.sellerName || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Product Name:
                            </Typography>
                            <Typography variant="body2">{detail?.productName || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Created At:
                            </Typography>
                            <Typography variant="body2">{detail?.createdAt || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Created By:
                            </Typography>
                            <Typography variant="body2">{detail?.createdBy || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Ended At:
                            </Typography>
                            <Typography variant="body2">{detail?.endedAt || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Planned Ended At:
                            </Typography>
                            <Typography variant="body2">
                                {detail?.plannedEndedAt || "\u2014"}
                            </Typography>
                            {detail?.plannedEndedAt && (
                                <CountdownBadge targetDate={detail.plannedEndedAt} />
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
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
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Total Orders:
                            </Typography>
                            <Typography variant="body2">{detail?.orderTotal ?? 0}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Total Product Quantity:
                            </Typography>
                            <Typography variant="body2">{detail?.totalProductQuantity ?? 0}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Seller Link:
                            </Typography>
                            {detail?.sellerLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.sellerLink)}
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
                                            handleCopyLink("sellerLink", detail.sellerLink)
                                        }
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "sellerLink" ? "Copied!" : "Copy"}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">{"\u2014"}</Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
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
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "sellerAuth" ? "Copied!" : "Copy"}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">{"\u2014"}</Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                Seller Auth Link Expires:
                            </Typography>
                            <Typography variant="body2">{detail?.sellerAuthLinkExpire || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
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
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "public" ? "Copied!" : "Copy"}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">{"\u2014"}</Typography>
                            )}
                        </Stack>
                    </Stack>
                </SectionBlock>

                {detail?.productPictures && detail.productPictures.length > 0 && (
                    <SectionBlock
                        title="Product Pictures"
                        description="Images associated with the product in this sale environment."
                    >
                        <Grid container spacing={2}>
                            {detail.productPictures.map((pic, idx) => (
                                <Grid size={{ xs: 6, sm: 4, md: 3 }} key={idx}>
                                    <Box
                                        component="img"
                                        src={pic.data || pic.link}
                                        alt={pic.title || `product-img-${idx}`}
                                        sx={{
                                            width: "100%",
                                            aspectRatio: "1 / 1",
                                            objectFit: "cover",
                                            borderRadius: 2,
                                            display: "block",
                                            border: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </SectionBlock>
                )}

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
                                        <TableCell>Order ID</TableCell>
                                        <TableCell>Ordered Time</TableCell>
                                        <TableCell>Buyer</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Unit</TableCell>
                                        <TableCell>Delivered</TableCell>
                                        <TableCell>Paid</TableCell>
                                        <TableCell>Note</TableCell>
                                        <TableCell>Seller Note</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(!detail?.orders || detail.orders.length === 0) ? (
                                        <TableRow>
                                            <TableCell colSpan={9} align="center">
                                                No order records.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        detail.orders.map((order, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{order.orderId || "\u2014"}</TableCell>
                                                <TableCell>{order.orderedTime || "\u2014"}</TableCell>
                                                <TableCell>{order.buyer || "\u2014"}</TableCell>
                                                <TableCell>{order.amount ?? "\u2014"}</TableCell>
                                                <TableCell>{order.unit || "\u2014"}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="small"
                                                        color={order.delivered ? "success" : "default"}
                                                        label={order.delivered ? "Yes" : "No"}
                                                        onClick={() => { }}
                                                        clickable={false}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="small"
                                                        color={order.getMoney ? "success" : "default"}
                                                        label={order.getMoney ? "Yes" : "No"}
                                                        onClick={() => { }}
                                                        clickable={false}
                                                    />
                                                </TableCell>
                                                <TableCell>{order.note || "\u2014"}</TableCell>
                                                <TableCell>{order.sellerNote || "\u2014"}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
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
