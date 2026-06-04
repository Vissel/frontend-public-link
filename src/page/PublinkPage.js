import React, { useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { pubApi } from "../api/index";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";
import { CountdownChip } from "../components/CountdownTimer";

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
                    title={saleSpace.sellerName || "Sale Space"}
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
                    <SectionBlock title="Products" description="Available items for purchase.">
                        <Grid container spacing={2}>
                            {saleSpace.listProduct.map((product, idx) => (
                                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
                                    <Card variant="outlined" sx={{ height: "100%" }}>
                                        <CardContent>
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
                                                        Total available: {product.total_amount} {product.unit || ""}
                                                    </Typography>
                                                )}
                                                {product.amount > 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Per order limit: {product.amount} {product.unit || ""}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </CardContent>
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
                                                    onClick={() => { }}
                                                    clickable={false}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.getMoney ? "Yes" : "No"}
                                                    color={order.getMoney ? "success" : "default"}
                                                    size="small"
                                                    onClick={() => { }}
                                                    clickable={false}
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
                {!isSeller && (
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
                )}
            </Stack>
        </PageContainer>
    );
};

export default PublinkPage;
