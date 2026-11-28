import React, { useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { pubApi } from "../api/index";
import { useAuth } from "../AuthContext";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";
import CommentSection from "../components/comment/CommentSection";
import { CountdownChip } from "../components/CountdownTimer";
import YogaSection from "../components/YogaSection";
import BadmintonSection from "../components/BadmintonSection";
import EnvironmentTransferCard from "../components/EnvironmentTransferCard";
import ShareLinkQrButton from "../components/ShareLinkQrButton";
import SaleWindowEditDialog from "../form/SaleWindowEditDialog";
import useDelayedClose from "../hooks/useDelayedClose";
import { useTranslation } from "react-i18next";
import { getExportLocale } from "../i18n/exportLocale";

const MAX_IMAGES = 6;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB (base64 adds ~33% overhead)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Failed to read: ${file.name}`));
        reader.readAsDataURL(file);
    });
};

const PublinkPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get("token");

    const [saleSpace, setSaleSpace] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const { userRole } = useAuth();
    const { t } = useTranslation();

    // Order form state
    const [buyerName, setBuyerName] = useState("");
    const [orderAmount, setOrderAmount] = useState(1);
    const [orderNote, setOrderNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState("");

    // Product edit state
    const [editProduct, setEditProduct] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saveSuccess, setSaveSuccess] = useState("");
    // Image edit state: existing pics (from API) + new pics (from file picker)
    const [existingPics, setExistingPics] = useState([]); // {data, title, link}
    const [newImageFiles, setNewImageFiles] = useState([]); // File objects
    const [newImagePreviews, setNewImagePreviews] = useState([]); // object URLs
    const [imageError, setImageError] = useState("");
    const fileInputRef = useRef(null);

    // Seller note inline editing
    const [editingNoteOrderId, setEditingNoteOrderId] = useState(null);
    const [draftNote, setDraftNote] = useState("");
    const noteInputRef = useRef(null);

    // Sale window editing. One link is one environment, so every displayed
    // time - the header chip, the planned end caption, the badge on a product
    // image - opens this single dialog.
    const [windowOpen, setWindowOpen] = useState(false);
    const [windowNotice, setWindowNotice] = useState("");
    const [linkCopied, setLinkCopied] = useState(false);

    const theme = useTheme();
    const fullScreenDialog = useMediaQuery(theme.breakpoints.down("sm"));

    useEffect(() => {
        if (!token) {
            setError(t("publink.errors.missingToken"));
            setLoading(false);
            return;
        }

        pubApi
            .post("/api/v1/publish/publink", {}, { params: { token } })
            .then((response) => {
                setSaleSpace(response.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to fetch sale space:", err);
                setError(
                    err?.response?.data?.message ||
                    t("publink.errors.unableToLoad")
                );
                setLoading(false);
            });
    }, [token]);

    // Focus the input when editing starts
    useEffect(() => {
        if (editingNoteOrderId !== null && noteInputRef.current) {
            noteInputRef.current.focus();
        }
    }, [editingNoteOrderId]);

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        setOrderSuccess("");
        setSubmitting(true);

        try {
            const orderRequest = {
                token,
                buyerName,
                amount: orderAmount,
                note: orderNote,
            };

            const response = await pubApi.post("/api/v1/publish/order", orderRequest);
            if (response.status === 200) {
                setOrderSuccess(t("publink.success.orderPlaced"));
                setBuyerName("");
                setOrderAmount(1);
                setOrderNote("");
                // Refresh data to show new order
                const refreshResponse = await pubApi.post("/api/v1/publish/publink", {}, {
                    params: { token },
                });
                setSaleSpace(refreshResponse.data);
            }
        } catch (err) {
            console.error("Order failed:", err);
            setError(
                err?.response?.data?.message || t("publink.errors.orderFailed")
            );
        } finally {
            setSubmitting(false);
        }
    };

    const refreshSaleSpace = async () => {
        const refreshResponse = await pubApi.post("/api/v1/publish/publink", {}, {
            params: { token },
        });
        setSaleSpace(refreshResponse.data);
        return refreshResponse.data;
    };

    const fallbackCopy = (text, onDone) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
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

    /**
     * The buyer-facing address of this link. The stored publicLink is the token
     * the server re-mints whenever the sale is extended, so it is preferred
     * over the browser address, which still carries the old token.
     */
    const buildShareUrl = () => {
        const currentToken = saleSpace?.publicLink || token;
        if (!currentToken) {
            return window.location.href;
        }
        return `${window.location.origin}${window.location.pathname}?token=${encodeURIComponent(currentToken)}`;
    };

    const handleShareLink = () => {
        const text = buildShareUrl();
        const markCopied = () => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
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

    /** Shaped like a seller list row so the shared dialog needs no variants. */
    const buildWindowEnvironment = () => ({
        requestUUID: saleSpace?.reqUuid,
        plannedStartedAt: saleSpace?.plannedStartedAt,
        plannedEndedAt: saleSpace?.plannedEndedAt,
        productName: saleSpace?.listProduct?.[0]?.productName,
    });

    // The refreshed payload carries both the new closing time and, after an
    // extension, the re-minted token the share button then hands out.
    const handleWindowSaved = async () => {
        setWindowNotice(t("saleWindow.updated"));
        try {
            await refreshSaleSpace();
        } catch (err) {
            console.error("Failed to refresh after sale window update", err);
        }
    };

    const handleOpenEdit = (product) => {
        setEditProduct(product);
        setEditForm({
            productId: product.productId,
            productName: product.productName || "",
            price: product.price ?? 0,
            amount: product.amount ?? 0,
            total_amount: product.total_amount ?? 0,
            unit: product.unit || "VND",
        });
        // Load existing images
        setExistingPics(product.listPicProMap || []);
        setNewImageFiles([]);
        setNewImagePreviews([]);
        setImageError("");
        setSaveError("");
        setSaveSuccess("");
    };

    const handleCloseEdit = () => {
        // A pending success close must not fire into a dialog the seller
        // already dismissed or reopened by hand.
        cancelEditClose();
        setEditProduct(null);
        setEditForm({});
        setExistingPics([]);
        // Revoke object URLs to avoid memory leaks
        newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setNewImageFiles([]);
        setNewImagePreviews([]);
        setImageError("");
        setSaveError("");
        setSaveSuccess("");
    };

    // The success alert lives inside this dialog, so dismissing it is the one
    // last step the seller should not have to take separately: keep the alert
    // on screen briefly, then close (see hooks/useDelayedClose).
    const { schedule: scheduleEditClose, cancel: cancelEditClose } =
        useDelayedClose(handleCloseEdit);

    const handleEditField = (field) => (e) => {
        const val = e.target.value;
        setEditForm((prev) => ({
            ...prev,
            [field]: ["price"].includes(field) ? parseFloat(val) || 0 :
                ["amount", "total_amount"].includes(field) ? parseInt(val, 10) || 0 : val,
        }));
    };

    const handleSaveProduct = async () => {
        if (!editForm.productName.trim()) {
            setSaveError(t("publink.errors.productNameRequired"));
            return;
        }
        setSaving(true);
        setSaveError("");
        setSaveSuccess("");

        try {
            // Detect if pictures have changed
            const originalPicsCount = (editProduct.listPicProMap || []).length;
            const picsChanged = newImageFiles.length > 0 || existingPics.length !== originalPicsCount;

            // Build the request payload
            const payload = {
                token,
                productId: editForm.productId,
                productName: editForm.productName,
                price: editForm.price,
                amount: editForm.amount,
                totalAmount: editForm.total_amount,
                unit: editForm.unit,
            };

            // Only send listPicProMap if pictures have changed
            if (picsChanged) {
                // Convert new image files to base64 data URIs
                const newPicData = await Promise.all(
                    newImageFiles.map((file) => readFileAsBase64(file))
                );

                // Build listPicProMap: keep existing + append new
                payload.listPicProMap = [
                    ...existingPics.map((pic) => ({
                        data: pic.data || null,
                        link: pic.link || null,
                        title: pic.title || "product-image",
                    })),
                    ...newPicData.map((dataUri) => ({
                        data: dataUri,
                        link: null,
                        title: "product-image",
                    })),
                ];
            }

            await pubApi.post("/api/v1/seller/product/update", payload);
            setSaveSuccess(t("publink.success.productUpdated"));
            const refreshedSaleSpace = await refreshSaleSpace();
            // Use the refresh response rather than the pre-save render state.
            const refreshed = refreshedSaleSpace.listProduct?.find(
                (p) => p.productId === editForm.productId
            );
            if (refreshed) {
                setEditProduct(refreshed);
                setExistingPics(refreshed.listPicProMap || []);
            }
            // Clear new images after save
            newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
            setNewImageFiles([]);
            setNewImagePreviews([]);
            scheduleEditClose();
        } catch (err) {
            console.error("Update product failed:", err);
            const errData = err?.response?.data;
            setSaveError(
                (typeof errData === "string" && errData) ||
                errData?.errorMessage ||
                errData?.message ||
                t("publink.errors.updateFailed")
            );
        } finally {
            setSaving(false);
        }
    };

    const handleToggleDelivered = async (order) => {
        try {
            await pubApi.post("/api/v1/seller/order/delivery", {
                orderId: order.orderId,
                token,
                delivered: !order.delivered,
            });
            await refreshSaleSpace();
        } catch (err) {
            console.error("Toggle delivered failed:", err);
        }
    };

    const handleToggleGetMoney = async (order) => {
        try {
            await pubApi.post("/api/v1/seller/order/getmoney", {
                orderId: order.orderId,
                token,
                getMoney: !order.getMoney,
            });
            await refreshSaleSpace();
        } catch (err) {
            console.error("Toggle getMoney failed:", err);
        }
    };

    const handleSaveSellerNote = async (order) => {
        try {
            await pubApi.post("/api/v1/seller/order/note", {
                orderId: order.orderId,
                token,
                sellerNote: draftNote,
            });
            setEditingNoteOrderId(null);
            setDraftNote("");
            await refreshSaleSpace();
        } catch (err) {
            console.error("Save seller note failed:", err);
        }
    };

    const handleStartEditNote = (order) => {
        setEditingNoteOrderId(order.orderId);
        setDraftNote(order.sellerNote || "");
    };

    const handleCancelEditNote = () => {
        setEditingNoteOrderId(null);
        setDraftNote("");
    };

    const handleAddImages = (e) => {
        setImageError("");
        const files = Array.from(e.target.files);
        const totalImages = existingPics.length + newImageFiles.length;

        if (totalImages + files.length > MAX_IMAGES) {
            setImageError(`${t("publink.errors.maxImages")}`);
            return;
        }
        for (const file of files) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                setImageError(t("publink.errors.fileType"));
                return;
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setImageError(t("publink.errors.fileSize"));
                return;
            }
        }

        const updated = [...newImageFiles, ...files].slice(0, MAX_IMAGES);
        setNewImageFiles(updated);
        // Create object URLs for previews
        const newUrls = files.map((f) => URL.createObjectURL(f));
        setNewImagePreviews((prev) => [...prev, ...newUrls].slice(0, MAX_IMAGES));
        e.target.value = "";
    };

    const handleRemoveExistingPic = (index) => {
        setExistingPics((prev) => prev.filter((_, i) => i !== index));
    };

    const handleRemoveNewImage = (index) => {
        URL.revokeObjectURL(newImagePreviews[index]);
        setNewImageFiles((prev) => prev.filter((_, i) => i !== index));
        setNewImagePreviews((prev) => prev.filter((_, i) => i !== index));
    };

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

    if (error || !saleSpace) {
        return (
            <PageContainer maxWidth="sm">
                <CardWrapper>
                    <Alert severity="error">
                        {error || t("publink.errors.notFound")}
                    </Alert>
                </CardWrapper>
            </PageContainer>
        );
    }

    const isSeller = Boolean(saleSpace.isSellerView);
    const isAdmin = String(userRole || "").toLowerCase() === "admin";
    const canManageOrders = isSeller || isAdmin;
    const isEnvStateActive = saleSpace.envState === "ACTIVE";
    // A window that has not opened yet still reports ACTIVE - the row is only
    // flipped closed by the hourly job - so the order form is gated on the
    // server-computed flag as well, matching what the backend refuses at order
    // time. The server decides it against DB time, not the browser clock.
    const isScheduled = Boolean(saleSpace.notStartedYet);
    const isYoga = saleSpace.productType === "YOGA_BOOKING";
    const isBadminton = saleSpace.productType === "BADMINTON_COURT";
    // Only the seller edits the window, and only while it runs: the server
    // refuses a sale that is already closed, and an admin has no role for the
    // seller-only endpoint anyway.
    const canEditWindow = isSeller && isEnvStateActive && Boolean(saleSpace.reqUuid);
    // The seller attaches one of their own accounts, an admin one of the
    // admin's own; the backend checks ownership either way.
    const canManageTransfer = (isSeller || isAdmin) && Boolean(saleSpace.reqUuid);

    const exportToExcel = async () => {
        const requestUUID = saleSpace.reqUuid;
        if (!requestUUID) return;
        try {
            const response = await pubApi.post(
                "/api/v1/seller/export",
                { requestUUID, locale: getExportLocale() },
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

    return (
        <PageContainer maxWidth="lg">
            <Stack spacing={3}>
                {/* Header */}
                <SectionBlock
                    title={`${t("publink.saleSpace")} ${saleSpace.sellerFullName || ""}`}
                    description={
                        isSeller
                            ? t("publink.sellerView")
                            : t("publink.buyerView")
                    }
                    action={
                        isSeller ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button variant="outlined" onClick={handleShareLink}>
                                    {linkCopied ? t("common.copied") : t("publink.shareLink")}
                                </Button>
                                <ShareLinkQrButton url={buildShareUrl()} />
                                <Button variant="contained" color="success" onClick={exportToExcel}>
                                    {t("publink.exportExcel")}
                                </Button>
                            </Stack>
                        ) : null
                    }
                >
                    {/* Header body: status and dates on the left, the transfer
                        account in a narrow bottom-right slot beside them. The
                        card only takes the height its own content needs. */}
                    <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        alignItems={{ xs: "stretch", md: "flex-start" }}
                    >
                        <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
                                <Chip
                                    label={isSeller ? t("publink.sellerViewLabel") : t("publink.buyerViewLabel")}
                                    color={isSeller ? "primary" : "default"}
                                    variant="outlined"
                                    size="small"
                                    onClick={() => { }}
                                    clickable={false}
                                />
                                {saleSpace.envState && (
                                    <Chip
                                        label={saleSpace.envState === "ACTIVE" ? t("common.active") : t("common.inactive")}
                                        color={saleSpace.envState === "ACTIVE" ? "success" : "default"}
                                        size="small"
                                        onClick={() => { }}
                                        clickable={false}
                                    />
                                )}
                                {saleSpace.plannedEndedAt && (
                                    <CountdownChip
                                        targetDate={saleSpace.plannedEndedAt}
                                        {...(canEditWindow
                                            ? {
                                                onClick: () => setWindowOpen(true),
                                                title: t("publink.editTimeHint"),
                                            }
                                            : {})}
                                    />
                                )}
                            </Stack>
                            <Stack spacing={0.5}>
                                {saleSpace.createdAt && (
                                    <Typography variant="caption" color="text.secondary">
                                        {t("publink.created")} {saleSpace.createdAt}
                                    </Typography>
                                )}
                                {saleSpace.endedAt && (
                                    <Typography variant="caption" color="text.secondary">
                                        {t("publink.willEnded")} {saleSpace.endedAt}
                                    </Typography>
                                )}
                                {saleSpace.plannedStartedAt && (
                                    <Typography variant="caption" color="text.secondary">
                                        {t("publink.plannedStartedAt")} {saleSpace.plannedStartedAt}
                                    </Typography>
                                )}
                                {saleSpace.plannedEndedAt && (
                                    <Typography
                                        variant="caption"
                                        color={canEditWindow ? "text.primary" : "text.secondary"}
                                        title={canEditWindow ? t("publink.editTimeHint") : undefined}
                                        onClick={canEditWindow ? () => setWindowOpen(true) : undefined}
                                        sx={canEditWindow
                                            ? {
                                                cursor: "pointer",
                                                textDecoration: "underline dotted",
                                                textUnderlineOffset: 3,
                                            }
                                            : undefined}
                                    >
                                        {t("publink.plannedEndedAt")} {saleSpace.plannedEndedAt}
                                    </Typography>
                                )}
                            </Stack>
                            {isScheduled && (
                                <Alert severity="warning">
                                    {t("publink.notStartedYet", { start: saleSpace.plannedStartedAt })}
                                </Alert>
                            )}
                            {windowNotice && (
                                <Alert
                                    severity="success"
                                    onClose={() => setWindowNotice("")}
                                >
                                    {windowNotice}
                                </Alert>
                            )}
                        </Stack>
                        <Box
                            sx={{
                                width: { xs: "100%", md: 360 },
                                flexShrink: 0,
                                // Bottom-right of the header: the left column
                                // keeps its top alignment, only this slot drops.
                                alignSelf: { md: "flex-end" },
                            }}
                        >
                            <EnvironmentTransferCard
                                transferInfo={saleSpace.transferInfo}
                                canManage={canManageTransfer}
                                mode={isSeller ? "seller" : "admin"}
                                requestUuid={saleSpace.reqUuid}
                                onChanged={refreshSaleSpace}
                                compact
                            />
                        </Box>
                    </Stack>
                </SectionBlock>

                {/* Yoga booking: the single weekly calendar screen replaces the
                    product cards and the order form for this link type. */}
                {isYoga && <YogaSection token={token} />}
                {isBadminton && (
                    <BadmintonSection token={token} transferInfo={saleSpace.transferInfo} />
                )}

                {/* Products */}
                {!isYoga && !isBadminton && saleSpace.listProduct && saleSpace.listProduct.length > 0 && (
                    <SectionBlock
                        title={t("publink.products")}
                        description={
                            isSeller
                                ? t("publink.productsSellerDesc")
                                : t("publink.productsBuyerDesc")
                        }
                    >
                        <Grid container spacing={2}>
                            {saleSpace.listProduct.map((product, idx) => (
                                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
                                    <Card
                                        variant="outlined"
                                        sx={{
                                            height: "100%",
                                            display: "flex",
                                            flexDirection: "column",
                                        }}
                                    >
                                        <CardContent sx={{ flexGrow: 1 }}>
                                            {product.listPicProMap && product.listPicProMap.length > 0 && (
                                                <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
                                                    {product.listPicProMap.map((pic, i) => (
                                                        <Box
                                                            key={i}
                                                            component="img"
                                                            src={pic.data || pic.link}
                                                            alt={pic.title || ""}
                                                            sx={{
                                                                width: 60,
                                                                height: 60,
                                                                objectFit: "cover",
                                                                borderRadius: 1,
                                                                border: "1px solid",
                                                                borderColor: "divider",
                                                            }}
                                                        />
                                                    ))}
                                                </Stack>
                                            )}
                                            {/* The closing time sits with the images and is
                                                the entry point of the window editor. */}
                                            {canEditWindow && saleSpace.plannedEndedAt && (
                                                <Stack direction="row" sx={{ mb: 1 }}>
                                                    <CountdownChip
                                                        targetDate={saleSpace.plannedEndedAt}
                                                        onClick={() => setWindowOpen(true)}
                                                        title={t("publink.editTimeHint")}
                                                    />
                                                </Stack>
                                            )}
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {product.productName || `${t("publink.products")} ${idx + 1}`}
                                            </Typography>
                                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                                                {product.price != null && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t("publink.price")} {product.price.toLocaleString()}{" "}
                                                        {product.unit || "VND"}
                                                    </Typography>
                                                )}
                                                {product.total_amount > 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t("publink.totalAmount")} {product.total_amount}
                                                    </Typography>
                                                )}
                                                {product.total_amount > 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t("publink.availableAmount")} {saleSpace.availableAmount}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </CardContent>
                                        {isSeller && (
                                            <Box sx={{ px: 2, pb: 1.5 }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    fullWidth
                                                    onClick={() => handleOpenEdit(product)}
                                                    sx={{ borderRadius: 2 }}
                                                >
                                                    {t("publink.editProduct")}
                                                </Button>
                                            </Box>
                                        )}
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </SectionBlock>
                )}

                {/* Product discussion: one comment thread on the primary product.
                    Reads are public (anonymous buyers see it), posting/editing
                    requires a signed-in account. targetType/product id are generic
                    so the same component drops onto post/guideline pages later. */}
                {!isYoga && !isBadminton && saleSpace.listProduct && saleSpace.listProduct.length > 0 && (
                    <SectionBlock
                        title={t("comment.title")}
                        description={t("comment.sectionDesc")}
                    >
                        <CommentSection
                            targetType="PRODUCT"
                            targetId={String(saleSpace.listProduct[0].productId)}
                            showTitle={false}
                        />
                    </SectionBlock>
                )}

                {/* Seller/Admin: Orders Table */}
                {!isYoga && !isBadminton && canManageOrders && saleSpace.listOrder && saleSpace.listOrder.length > 0 && (
                    <SectionBlock
                        title={t("publink.orders")}
                        description={t("publink.ordersDesc")}
                    >
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("publink.time")}</TableCell>
                                        <TableCell>{t("publink.buyer")}</TableCell>
                                        <TableCell>{t("publink.amount")}</TableCell>
                                        <TableCell>{t("publink.note")}</TableCell>
                                        <TableCell>{t("publink.delivered")}</TableCell>
                                        <TableCell>{t("publink.paid")}</TableCell>
                                        <TableCell>{t("publink.sellerNote")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {saleSpace.listOrder.map((order) => (
                                        <TableRow key={order.orderId} hover>
                                            <TableCell>{order.orderedTime || "—"}</TableCell>
                                            <TableCell>{order.buyer || "—"}</TableCell>
                                            <TableCell>
                                                {order.amount} {order.unit || ""}
                                            </TableCell>
                                            <TableCell>{order.note || "—"}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.delivered ? t("common.yes") : t("common.no")}
                                                    color={order.delivered ? "success" : "default"}
                                                    size="small"
                                                    clickable={canManageOrders}
                                                    onClick={(e) => {
                                                        if (!canManageOrders) return;
                                                        e.stopPropagation();
                                                        handleToggleDelivered(order);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.getMoney ? t("common.yes") : t("common.no")}
                                                    color={order.getMoney ? "success" : "default"}
                                                    size="small"
                                                    clickable={canManageOrders}
                                                    onClick={(e) => {
                                                        if (!canManageOrders) return;
                                                        e.stopPropagation();
                                                        handleToggleGetMoney(order);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell
                                                onClick={(e) => e.stopPropagation()}
                                                sx={{ minWidth: 120 }}
                                            >
                                                {canManageOrders ? (
                                                    editingNoteOrderId === order.orderId ? (
                                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                                            <TextField
                                                                inputRef={noteInputRef}
                                                                size="small"
                                                                value={draftNote}
                                                                onChange={(e) => setDraftNote(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        handleSaveSellerNote(order);
                                                                    } else if (e.key === "Escape") {
                                                                        handleCancelEditNote();
                                                                    }
                                                                }}
                                                                onBlur={() => {
                                                                    setTimeout(() => {
                                                                        if (editingNoteOrderId === order.orderId) {
                                                                            handleSaveSellerNote(order);
                                                                        }
                                                                    }, 150);
                                                                }}
                                                                sx={{
                                                                    "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8rem" },
                                                                    "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "divider" } },
                                                                }}
                                                                inputProps={{ maxLength: 200 }}
                                                            />
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSaveSellerNote(order);
                                                                }}
                                                                sx={{ p: 0.5 }}
                                                                title="Save note"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                            </IconButton>
                                                        </Stack>
                                                    ) : (
                                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                                            <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                                                                {order.sellerNote || "\u2014"}
                                                            </Typography>
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStartEditNote(order);
                                                                }}
                                                                sx={{ p: 0.5 }}
                                                                title="Edit note"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                            </IconButton>
                                                        </Stack>
                                                    )
                                                ) : (
                                                    <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                                                        {order.sellerNote || "\u2014"}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </SectionBlock>
                )}

                {/* Seller/Admin: No orders yet */}
                {!isYoga && canManageOrders && (!saleSpace.listOrder || saleSpace.listOrder.length === 0) && (
                    <CardWrapper>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ textAlign: "center", py: 2 }}
                        >
                            {t("publink.noOrders")}
                        </Typography>
                    </CardWrapper>
                )}

                {/* Buyer: Order Form */}

                {!isYoga && isEnvStateActive && !isScheduled && <SectionBlock
                    title={t("publink.placeOrder")}
                    description={t("publink.placeOrderDesc")}
                >
                    {orderSuccess && <Alert severity="success">{orderSuccess}</Alert>}
                    <Box component="form" onSubmit={handlePlaceOrder}>
                        <Stack spacing={2}>
                            <TextField
                                label={t("publink.yourName")}
                                type="text"
                                value={buyerName}
                                onChange={(e) => setBuyerName(e.target.value)}
                                required
                                fullWidth
                            />
                            <TextField
                                label={t("publink.amount")}
                                type="number"
                                value={orderAmount}
                                onChange={(e) => setOrderAmount(parseInt(e.target.value, 10) || 1)}
                                inputProps={{ min: 1 }}
                                fullWidth
                            />
                            <TextField
                                label={t("publink.noteOptional")}
                                type="text"
                                value={orderNote}
                                onChange={(e) => setOrderNote(e.target.value)}
                                multiline
                                rows={2}
                                fullWidth
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={submitting || !buyerName}
                                sx={{ alignSelf: "flex-start" }}
                            >
                                {submitting ? t("publink.placingOrder") : t("publink.placeOrderButton")}
                            </Button>
                        </Stack>
                    </Box>
                </SectionBlock>
                }
            </Stack>

            {/* Product Edit Dialog */}
            <Dialog
                open={Boolean(editProduct)}
                onClose={handleCloseEdit}
                fullScreen={fullScreenDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ pb: 1 }}>
                    {t("publink.editProductTitle")}
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2.5} sx={{ pt: 1 }}>
                        {saveError && <Alert severity="error">{saveError}</Alert>}
                        {saveSuccess && <Alert severity="success">{saveSuccess}</Alert>}
                        <TextField
                            label={t("publink.productName")}
                            value={editForm.productName || ""}
                            onChange={handleEditField("productName")}
                            required
                            fullWidth
                        />
                        <TextField
                            label={t("publink.price")}
                            type="number"
                            value={editForm.price ?? 0}
                            onChange={handleEditField("price")}
                            inputProps={{ min: 0, step: "any" }}
                            fullWidth
                        />
                        <TextField
                            label={t("publink.unit")}
                            value={editForm.unit || ""}
                            onChange={handleEditField("unit")}
                            placeholder={t("publink.unitPlaceholder")}
                            fullWidth
                        />
                        <TextField
                            label={t("publink.totalAvailable")}
                            type="number"
                            value={editForm.amount ?? 0}
                            onChange={handleEditField("amount")}
                            inputProps={{ min: 0 }}
                            fullWidth
                        />
                        {/* <TextField
                            label="Per Order Limit"
                            type="number"
                            value={editForm.amount ?? 0}
                            onChange={handleEditField("amount")}
                            inputProps={{ min: 0 }}
                            fullWidth
                        /> */}

                        {/* Image Management */}
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2">
                                {t("publink.images")} ({existingPics.length + newImageFiles.length}/{MAX_IMAGES})
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("publink.imagesNote")}
                            </Typography>

                            {imageError && (
                                <Typography variant="caption" color="error">
                                    {imageError}
                                </Typography>
                            )}

                            {existingPics.length + newImageFiles.length < MAX_IMAGES && (
                                <Button component="label" variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
                                    {t("publink.addImages")}
                                    <Box
                                        component="input"
                                        hidden
                                        type="file"
                                        multiple
                                        accept="image/jpeg,image/png,image/webp"
                                        ref={fileInputRef}
                                        onChange={handleAddImages}
                                    />
                                </Button>
                            )}

                            {/* Existing images */}
                            {existingPics.length > 0 && (
                                <Grid container spacing={1}>
                                    {existingPics.map((pic, i) => (
                                        <Grid key={`existing-${i}`} size={{ xs: 4, sm: 3 }}>
                                            <Box sx={{ position: "relative" }}>
                                                <Box
                                                    component="img"
                                                    src={pic.data || pic.link}
                                                    alt={pic.title || `img-${i}`}
                                                    sx={{
                                                        width: "100%",
                                                        aspectRatio: "1 / 1",
                                                        objectFit: "cover",
                                                        borderRadius: 1.5,
                                                        display: "block",
                                                        border: "1px solid",
                                                        borderColor: "divider",
                                                    }}
                                                />
                                                <Button
                                                    size="small"
                                                    onClick={() => handleRemoveExistingPic(i)}
                                                    sx={{
                                                        position: "absolute",
                                                        top: 2,
                                                        right: 2,
                                                        minWidth: 22,
                                                        width: 22,
                                                        height: 22,
                                                        p: 0,
                                                        fontSize: 12,
                                                        lineHeight: 1,
                                                        bgcolor: "rgba(255,255,255,0.85)",
                                                        color: "error.main",
                                                        "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                                                    }}
                                                >
                                                    ✕
                                                </Button>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}

                            {/* New image previews */}
                            {newImagePreviews.length > 0 && (
                                <Grid container spacing={1}>
                                    {newImagePreviews.map((previewUrl, i) => (
                                        <Grid key={`new-${i}`} size={{ xs: 4, sm: 3 }}>
                                            <Box sx={{ position: "relative" }}>
                                                <Box
                                                    component="img"
                                                    src={previewUrl}
                                                    alt={`new-img-${i}`}
                                                    sx={{
                                                        width: "100%",
                                                        aspectRatio: "1 / 1",
                                                        objectFit: "cover",
                                                        borderRadius: 1.5,
                                                        display: "block",
                                                        border: "2px solid",
                                                        borderColor: "primary.main",
                                                    }}
                                                />
                                                <Button
                                                    size="small"
                                                    onClick={() => handleRemoveNewImage(i)}
                                                    sx={{
                                                        position: "absolute",
                                                        top: 2,
                                                        right: 2,
                                                        minWidth: 22,
                                                        width: 22,
                                                        height: 22,
                                                        p: 0,
                                                        fontSize: 12,
                                                        lineHeight: 1,
                                                        bgcolor: "rgba(255,255,255,0.85)",
                                                        color: "error.main",
                                                        "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                                                    }}
                                                >
                                                    ✕
                                                </Button>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={handleCloseEdit} disabled={saving}>
                        {t("common.cancel")}
                    </Button>
                    <Button
                        onClick={handleSaveProduct}
                        variant="contained"
                        disabled={saving}
                    >
                        {saving ? t("publink.saving") : t("publink.saveChanges")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Sale window edit: opened by clicking any displayed closing time. */}
            <SaleWindowEditDialog
                open={windowOpen}
                environment={buildWindowEnvironment()}
                onClose={() => setWindowOpen(false)}
                onSaved={handleWindowSaved}
            />
        </PageContainer>
    );
};

export default PublinkPage;
