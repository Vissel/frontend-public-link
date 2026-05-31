import React, { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    Grid,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import CardWrapper from "../components/CardWrapper";

const MAX_IMAGES = 6;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB (base64 encoding adds ~33% overhead, keep images small)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ProductForm = ({ initialData = {}, onDataChange }) => {
    const [form, setForm] = useState({
        productName: initialData.productName || "",
        description: initialData.description || "",
        quantity: initialData.quantity || "",
        price: initialData.price || "",
    });

    const [images, setImages] = useState([]);
    const [previewUrls, setPreviewUrls] = useState([]);
    const [imageError, setImageError] = useState("");
    const [priceDisplay, setPriceDisplay] = useState(
        initialData.price
            ? Number(initialData.price).toLocaleString("en-US")
            : ""
    );
    const priceInputRef = useRef(null);

    const formatVND = (value) => {
        if (value === "" || value === undefined || value === null) return "";
        const num = Number(value);
        if (Number.isNaN(num)) return "";
        return num.toLocaleString("en-US");
    };

    useEffect(() => {
        const nextPreviews = images.map((image) => URL.createObjectURL(image));
        setPreviewUrls(nextPreviews);

        return () => {
            nextPreviews.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [images]);

    useEffect(() => {
        onDataChange?.({ ...form, images });
    }, [form, images, onDataChange]);

    const handleFieldChange = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handlePriceFocus = () => {
        setPriceDisplay(String(form.price || ""));
    };

    const handlePriceBlur = () => {
        setPriceDisplay(formatVND(form.price));
    };

    const handlePriceChange = (e) => {
        const raw = e.target.value.replace(/,/g, "");
        const num = raw === "" ? "" : Number(raw);
        if (raw !== "" && Number.isNaN(Number(raw))) return;
        setPriceDisplay(raw);
        handleFieldChange("price", num);
    };

    const handleFileChange = (e) => {
        setImageError("");
        const files = Array.from(e.target.files);

        if (images.length + files.length > MAX_IMAGES) {
            setImageError(`You can upload up to ${MAX_IMAGES} images total.`);
            return;
        }

        for (const file of files) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                setImageError("Only JPEG, PNG, and WebP images are allowed.");
                return;
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setImageError("Each image must be under 1 MB (base64 transport).");
                return;
            }
        }

        setImages((prev) => [...prev, ...files].slice(0, MAX_IMAGES));
        e.target.value = "";
    };

    const handleRemoveImage = (index) => {
        setImages((prev) => prev.filter((_, i) => i !== index));
    };

    return (
        <Stack spacing={2.5}>
            <Typography variant="subtitle1" fontWeight={600}>
                Product Details (optional)
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Fill in any product information below. All fields are optional.
            </Typography>

            <TextField
                label="Product Name"
                name="productName"
                value={form.productName}
                onChange={(e) => handleFieldChange("productName", e.target.value)}
                fullWidth
            />

            <TextField
                label="Description"
                name="description"
                value={form.description}
                onChange={(e) => handleFieldChange("description", e.target.value)}
                multiline
                rows={3}
                fullWidth
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    label="Quantity"
                    name="quantity"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={form.quantity}
                    onChange={(e) => handleFieldChange("quantity", e.target.value)}
                    fullWidth
                />
                <TextField
                    label="Price for one (VND)"
                    name="price"
                    type="text"
                    inputRef={priceInputRef}
                    value={priceDisplay}
                    onFocus={handlePriceFocus}
                    onBlur={handlePriceBlur}
                    onChange={handlePriceChange}
                    fullWidth
                />
            </Stack>

            <Stack spacing={1.5}>
                <Typography variant="subtitle2">
                    Product Images ({images.length}/{MAX_IMAGES})
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Upload up to {MAX_IMAGES} images (JPEG, PNG, WebP, max 1 MB each).
                </Typography>

                {imageError && (
                    <Typography variant="caption" color="error">
                        {imageError}
                    </Typography>
                )}

                {images.length < MAX_IMAGES && (
                    <Button component="label" variant="outlined" size="small">
                        Choose images
                        <Box
                            component="input"
                            hidden
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileChange}
                        />
                    </Button>
                )}

                {images.length > 0 && (
                    <Grid container spacing={1}>
                        {previewUrls.map((previewUrl, index) => (
                            <Grid key={previewUrl} size={{ xs: 4, sm: 3 }}>
                                <CardWrapper
                                    sx={{
                                        p: 0.5,
                                        borderRadius: 2,
                                        position: "relative",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={previewUrl}
                                        alt={`product-img-${index}`}
                                        sx={{
                                            width: "100%",
                                            aspectRatio: "1 / 1",
                                            objectFit: "cover",
                                            borderRadius: 1.5,
                                            display: "block",
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        onClick={() => handleRemoveImage(index)}
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
                                            color: "text.secondary",
                                            "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                                        }}
                                    >
                                        ✕
                                    </Button>
                                </CardWrapper>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Stack>
        </Stack>
    );
};

export default ProductForm;
