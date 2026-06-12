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
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();

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
            setError(t("environmentDetail.errors.noUuid"));
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
                setError(t("environmentDetail.errors.fetchFailed"));
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
    }, [requestUuid]);

    if (loading) {
        return (
            <PageContainer maxWidth="md">
                <Typography>{t("common.loading")}</Typography>
            </PageContainer>
        );
    }

    if (error) {
        return (
            <PageContainer maxWidth="md">
                <Alert severity="error">{error}</Alert>
                <Button sx={{ mt: 2 }} variant="outlined" onClick={() => navigate("/adminHome")}>
                    {t("environmentDetail.backToAdmin")}
                </Button>
            </PageContainer>
        );
    }

    return (
        <PageContainer maxWidth="md">
            <Stack spacing={3}>
                <SectionBlock
                    title={t("environmentDetail.title")}
                    description={`${t("environmentDetail.subtitle")} ${requestUuid}`}
                    action={
                        <Button variant="outlined" onClick={() => navigate("/adminHome")}>
                            {t("environmentDetail.backToAdmin")}
                        </Button>
                    }
                >
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.requestUuid")}
                            </Typography>
                            <Typography variant="body2">{detail?.requestUUID || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.requestId")}
                            </Typography>
                            <Typography variant="body2">{detail?.requestId || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.sellerName")}
                            </Typography>
                            <Typography variant="body2">{detail?.sellerName || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.productName")}
                            </Typography>
                            <Typography variant="body2">{detail?.productName || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.createdAt")}
                            </Typography>
                            <Typography variant="body2">{detail?.createdAt || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.createdBy")}
                            </Typography>
                            <Typography variant="body2">{detail?.createdBy || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.endedAt")}
                            </Typography>
                            <Typography variant="body2">{detail?.endedAt || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.plannedEndedAt")}
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
                                {t("environmentDetail.status")}
                            </Typography>
                            <Chip
                                size="small"
                                color={detail?.envStatus ? "success" : "default"}
                                label={detail?.envStatus ? t("common.active") : t("common.inactive")}
                                onClick={() => { }}
                                clickable={false}
                            />
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.totalOrders")}
                            </Typography>
                            <Typography variant="body2">{detail?.orderTotal ?? 0}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.totalQuantity")}
                            </Typography>
                            <Typography variant="body2">{detail?.totalProductQuantity ?? 0}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.sellerLink")}
                            </Typography>
                            {detail?.sellerLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.sellerLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        underline="hover"
                                    >
                                        {t("environmentDetail.openLink")}
                                    </Link>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() =>
                                            handleCopyLink("sellerLink", detail.sellerLink)
                                        }
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "sellerLink" ? t("common.copied") : t("common.copy")}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">{"\u2014"}</Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.sellerAuthLink")}
                            </Typography>
                            {detail?.sellerAuthLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.sellerAuthLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        underline="hover"
                                    >
                                        {t("environmentDetail.openLink")}
                                    </Link>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() =>
                                            handleCopyLink("sellerAuth", detail.sellerAuthLink)
                                        }
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "sellerAuth" ? t("common.copied") : t("common.copy")}
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="body2">{"\u2014"}</Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.sellerAuthExpires")}
                            </Typography>
                            <Typography variant="body2">{detail?.sellerAuthLinkExpire || "\u2014"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                                {t("environmentDetail.publicLink")}
                            </Typography>
                            {detail?.publicLink ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Link
                                        href={addHostToHref(detail.publicLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        underline="hover"
                                    >
                                        {t("environmentDetail.openLink")}
                                    </Link>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() =>
                                            handleCopyLink("public", detail.publicLink)
                                        }
                                        sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                    >
                                        {copiedKey === "public" ? t("common.copied") : t("common.copy")}
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
                        title={t("environmentDetail.productPictures")}
                        description={t("environmentDetail.productPicturesDesc")}
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
                    title={t("environmentDetail.pricing")}
                    description={t("environmentDetail.pricingDesc")}
                >
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                        <Typography variant="h6">
                            {t("environmentDetail.total")}{" "}
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
                                    <TableCell>{t("environmentDetail.duration")}</TableCell>
                                    <TableCell>{t("environmentDetail.amount")}</TableCell>
                                    <TableCell>{t("environmentDetail.currency")}</TableCell>
                                    <TableCell>{t("environmentDetail.createdAt")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(!detail?.pricings || detail.pricings.length === 0) ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">
                                            {t("environmentDetail.noPricing")}
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
                        title={t("environmentDetail.orders")}
                        description={t("environmentDetail.ordersDesc")}
                    >
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("environmentDetail.orderId")}</TableCell>
                                        <TableCell>{t("environmentDetail.orderedTime")}</TableCell>
                                        <TableCell>{t("environmentDetail.buyer")}</TableCell>
                                        <TableCell>{t("environmentDetail.amount")}</TableCell>
                                        <TableCell>{t("environmentDetail.unit")}</TableCell>
                                        <TableCell>{t("environmentDetail.delivered")}</TableCell>
                                        <TableCell>{t("environmentDetail.paid")}</TableCell>
                                        <TableCell>{t("environmentDetail.note")}</TableCell>
                                        <TableCell>{t("environmentDetail.sellerNote")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(!detail?.orders || detail.orders.length === 0) ? (
                                        <TableRow>
                                            <TableCell colSpan={9} align="center">
                                                {t("environmentDetail.noOrders")}
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
                                                        label={order.delivered ? t("common.yes") : t("common.no")}
                                                        onClick={() => { }}
                                                        clickable={false}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="small"
                                                        color={order.getMoney ? "success" : "default"}
                                                        label={order.getMoney ? t("common.yes") : t("common.no")}
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
