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
import { CountdownChip } from "../components/CountdownTimer";
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
            await refreshSaleSpace();
            // Update the editProduct with refreshed data
            const refreshed = saleSpace.listProduct?.find(
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
                            <Button variant="contained" color="success" onClick={exportToExcel}>
                                {t("publink.exportExcel")}
                            </Button>
                        ) : null
                    }
                >
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
                            <CountdownChip targetDate={saleSpace.plannedEndedAt} />
                        )}
                    </Stack>
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
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
                        {saleSpace.plannedEndedAt && (
                            <Typography variant="caption" color="text.secondary">
                                {t("publink.plannedEndedAt")} {saleSpace.plannedEndedAt}
                            </Typography>
                        )}
                    </Stack>
                </SectionBlock>

                {/* Products */}
                {saleSpace.listProduct && saleSpace.listProduct.length > 0 && (
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

                {/* Seller/Admin: Orders Table */}
                {canManageOrders && saleSpace.listOrder && saleSpace.listOrder.length > 0 && (
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
                {canManageOrders && (!saleSpace.listOrder || saleSpace.listOrder.length === 0) && (
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

              {isEnvStateActive && <SectionBlock
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
        </PageContainer>
    );
};

export default PublinkPage;
