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
import api, { pubApi } from "../api/index";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";
import { CountdownChip } from "../components/CountdownTimer";

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

    const theme = useTheme();
    const fullScreenDialog = useMediaQuery(theme.breakpoints.down("sm"));

    useEffect(() => {
        if (!token) {
            setError("Missing token parameter.");
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
                    "Unable to load sale space. The link may be invalid or expired."
                );
                setLoading(false);
            });
    }, [token]);

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
                setOrderSuccess("Order placed successfully!");
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
                err?.response?.data?.message || "Failed to place order. Please try again."
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
            setSaveError("Product name is required.");
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
            setSaveSuccess("Product updated successfully!");
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
            setSaveError(
                err?.response?.data || "Failed to update product. Please try again."
            );
        } finally {
            setSaving(false);
        }
    };

    const handleToggleDelivered = async (order) => {
        try {
            await api.post("/api/v1/seller/order/delivery", {
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
            await api.post("/api/v1/seller/order/getmoney", {
                orderId: order.orderId,
                token,
                getMoney: !order.getMoney,
            });
            await refreshSaleSpace();
        } catch (err) {
            console.error("Toggle getMoney failed:", err);
        }
    };

    const handleAddImages = (e) => {
        setImageError("");
        const files = Array.from(e.target.files);
        const totalImages = existingPics.length + newImageFiles.length;

        if (totalImages + files.length > MAX_IMAGES) {
            setImageError(`You can have up to ${MAX_IMAGES} images total.`);
            return;
        }
        for (const file of files) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                setImageError("Only JPEG, PNG, and WebP images are allowed.");
                return;
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setImageError("Each image must be under 1 MB.");
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
                        Loading...
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
                        {error || "Sale space not found or link is invalid."}
                    </Alert>
                </CardWrapper>
            </PageContainer>
        );
    }

    const isSeller = Boolean(saleSpace.isSellerView);

    return (
        <PageContainer maxWidth="lg">
            <Stack spacing={3}>
                {/* Header */}
                <SectionBlock
                    title={"Sale Space " + saleSpace.sellerFullName || ""}
                    description={
                        isSeller
                            ? "Seller view — manage orders and products."
                            : "Browse products and place your order."
                    }
                >
                    <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
                        <Chip
                            label={isSeller ? "Seller View" : "Buyer View"}
                            color={isSeller ? "primary" : "default"}
                            variant="outlined"
                            size="small"
                            onClick={() => { }}
                            clickable={false}
                        />
                        {saleSpace.envState && (
                            <Chip
                                label={saleSpace.envState === "ACTIVE" ? "Active" : "Inactive"}
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
                                Created: {saleSpace.createdAt}
                            </Typography>
                        )}
                        {saleSpace.endedAt && (
                            <Typography variant="caption" color="text.secondary">
                                Will Ended: {saleSpace.endedAt}
                            </Typography>
                        )}
                        {saleSpace.plannedEndedAt && (
                            <Typography variant="caption" color="text.secondary">
                                Planned Ended At: {saleSpace.plannedEndedAt}
                            </Typography>
                        )}
                    </Stack>
                </SectionBlock>

                {/* Products */}
                {saleSpace.listProduct && saleSpace.listProduct.length > 0 && (
                    <SectionBlock
                        title="Products"
                        description={
                            isSeller
                                ? "Tap edit to modify product details."
                                : "Available items for purchase."
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
                                                {product.productName || `Product ${idx + 1}`}
                                            </Typography>
                                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                                                {product.price != null && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Price: {product.price.toLocaleString()}{" "}
                                                        {product.unit || "VND"}
                                                    </Typography>
                                                )}
                                                {product.total_amount > 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Total amount: {product.total_amount}
                                                    </Typography>
                                                )}
                                                {product.total_amount > 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Available amount: {product.total_amount - product.amount}
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
                                                    Edit Product
                                                </Button>
                                            </Box>
                                        )}
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </SectionBlock>
                )}

                {/* Seller: Orders Table */}
                {isSeller && saleSpace.listOrder && saleSpace.listOrder.length > 0 && (
                    <SectionBlock title="Orders" description="Customer orders for your products.">
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Time</TableCell>
                                        <TableCell>Buyer</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Note</TableCell>
                                        <TableCell>Delivered</TableCell>
                                        <TableCell>Paid</TableCell>
                                        <TableCell>Seller Note</TableCell>
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
                                                    label={order.delivered ? "Yes" : "No"}
                                                    color={order.delivered ? "success" : "default"}
                                                    size="small"
                                                    clickable
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleDelivered(order);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.getMoney ? "Yes" : "No"}
                                                    color={order.getMoney ? "success" : "default"}
                                                    size="small"
                                                    clickable
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleGetMoney(order);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>{order.sellerNote || "—"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </SectionBlock>
                )}

                {/* Seller: No orders yet */}
                {isSeller && (!saleSpace.listOrder || saleSpace.listOrder.length === 0) && (
                    <CardWrapper>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ textAlign: "center", py: 2 }}
                        >
                            No orders yet. Share the public link with buyers.
                        </Typography>
                    </CardWrapper>
                )}

                {/* Buyer: Order Form */}

                <SectionBlock
                    title="Place an Order"
                    description="Fill in your details to place an order."
                >
                    {orderSuccess && <Alert severity="success">{orderSuccess}</Alert>}
                    <Box component="form" onSubmit={handlePlaceOrder}>
                        <Stack spacing={2}>
                            <TextField
                                label="Your Name"
                                type="text"
                                value={buyerName}
                                onChange={(e) => setBuyerName(e.target.value)}
                                required
                                fullWidth
                            />
                            <TextField
                                label="Amount"
                                type="number"
                                value={orderAmount}
                                onChange={(e) => setOrderAmount(parseInt(e.target.value, 10) || 1)}
                                inputProps={{ min: 1 }}
                                fullWidth
                            />
                            <TextField
                                label="Note (optional)"
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
                                {submitting ? "Placing Order..." : "Place Order"}
                            </Button>
                        </Stack>
                    </Box>
                </SectionBlock>
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
                    Edit Product
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2.5} sx={{ pt: 1 }}>
                        {saveError && <Alert severity="error">{saveError}</Alert>}
                        {saveSuccess && <Alert severity="success">{saveSuccess}</Alert>}
                        <TextField
                            label="Product Name"
                            value={editForm.productName || ""}
                            onChange={handleEditField("productName")}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Price"
                            type="number"
                            value={editForm.price ?? 0}
                            onChange={handleEditField("price")}
                            inputProps={{ min: 0, step: "any" }}
                            fullWidth
                        />
                        <TextField
                            label="Unit"
                            value={editForm.unit || ""}
                            onChange={handleEditField("unit")}
                            placeholder="e.g. VND, kg, pcs"
                            fullWidth
                        />
                        <TextField
                            label="Total Available"
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
                                Images ({existingPics.length + newImageFiles.length}/{MAX_IMAGES})
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                JPEG, PNG, WebP — max 1 MB each.
                            </Typography>

                            {imageError && (
                                <Typography variant="caption" color="error">
                                    {imageError}
                                </Typography>
                            )}

                            {existingPics.length + newImageFiles.length < MAX_IMAGES && (
                                <Button component="label" variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
                                    Add images
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
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSaveProduct}
                        variant="contained"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default PublinkPage;
