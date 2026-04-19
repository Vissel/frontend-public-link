import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../AuthContext";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const GenerationPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestData } = location.state || {};
  const { logout } = useAuth();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [seller, setSeller] = useState({
    name: requestData?.seller.username || "",
    link: requestData?.seller.link || "",
    authenticated: requestData?.authenticated || false,
  });

  const [product, setProduct] = useState({
    name: "",
    amount: "",
    unit: "",
    price: "",
    total_amount: "",
  });

  const [images, setImages] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);

  useEffect(() => {
    const nextPreviews = images.map((image) => URL.createObjectURL(image));
    setPreviewUrls(nextPreviews);

    return () => {
      nextPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  const handleSellerChange = (e) => {
    setSeller({ ...seller, [e.target.name]: e.target.value });
  };

  const handleProductChange = (e) => {
    setProduct({ ...product, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 10);
    setImages(files);
  };

  const handleCancel = () => navigate("/home");

  const handleSave = async () => {
    setError("");
    setSaving(true);

    try {
      const payload = {
        accessToken: localStorage.getItem("token"),
        seller: {
          username: seller.name,
          link: seller.link,
        },
        createdBy: requestData.createdBy,
        authenticated: seller.authenticated,
        products: [
          {
            productName: product.name,
            amount: product.amount,
            unit: product.unit,
            price: product.price,
            total_amount: product.total_amount,
            listPicProMap: images,
          },
        ],
      };
      console.log("Saving:", payload);

      const response = await api.post(
        "/api/generator/generatePublicLink",
        payload
      );
      if (response.status === 200) {
        console.log("Generate public link successful!");
        navigate("/home", {
          state: {
            sellerName: seller.name,
            publicLink: response.data,
          },
        });
      }
      if (response.status === 403) {
        logout();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Unable to save the generated product link."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!requestData) {
    return (
      <PageContainer maxWidth="md">
        <SectionBlock
          title="Generation Page"
          description="A seller request must be selected before opening this generation workflow."
        >
          <Stack spacing={2}>
            <Alert severity="warning">
              No seller request data was supplied for this page.
            </Alert>
            <Button variant="contained" onClick={handleCancel}>
              Back to dashboard
            </Button>
          </Stack>
        </SectionBlock>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title="Generate Product Link"
          description="Review seller details, attach product information, and publish the public order page using the shared MUI workflow."
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button variant="outlined" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                Save
              </Button>
            </Stack>
          }
        >
          {error && <Alert severity="error">{error}</Alert>}
        </SectionBlock>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionBlock
              title="Seller Information"
              description="Seller identity and source link information."
            >
              <Stack spacing={2}>
                <TextField
                  label="Name"
                  name="name"
                  value={seller.name}
                  onChange={handleSellerChange}
                />
                <TextField
                  label="Link"
                  name="link"
                  value={seller.link}
                  onChange={handleSellerChange}
                />
                <FormControlLabel
                  control={<Checkbox checked={Boolean(seller.authenticated)} disabled />}
                  label="Authenticated by seller"
                />
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">Upload Product Images</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upload up to 10 product images. The previews below use the same responsive card spacing as the rest of the app.
                  </Typography>
                  <Button component="label" variant="outlined">
                    Choose images
                    <Box
                      component="input"
                      hidden
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </Button>
                  <Grid container spacing={1.5}>
                    {previewUrls.map((previewUrl, index) => (
                      <Grid key={previewUrl} size={{ xs: 6, sm: 4 }}>
                        <CardWrapper
                          sx={{
                            p: 1,
                            borderRadius: 3,
                          }}
                        >
                          <Box
                            component="img"
                            src={previewUrl}
                            alt={`preview-${index}`}
                            sx={{
                              width: "100%",
                              aspectRatio: "1 / 1",
                              objectFit: "cover",
                              borderRadius: 2,
                            }}
                          />
                        </CardWrapper>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </Stack>
            </SectionBlock>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <SectionBlock
              title="Product Information"
              description="Product description, pricing, and inventory data for the public page."
            >
              <Stack spacing={2}>
                <TextField
                  label="Product Description"
                  name="name"
                  value={product.name}
                  onChange={handleProductChange}
                  multiline
                  rows={10}
                />
                <TextField
                  label="Amount in unit in price"
                  helperText="Example: amount is 1 for a display such as 1/kg/10k."
                  type="number"
                  name="amount"
                  value={product.amount}
                  onChange={handleProductChange}
                />
                <TextField
                  label="Unit"
                  name="unit"
                  value={product.unit}
                  onChange={handleProductChange}
                />
                <TextField
                  label="Price"
                  name="price"
                  value={product.price}
                  onChange={handleProductChange}
                />
                <TextField
                  label="Total amount"
                  name="total_amount"
                  value={product.total_amount}
                  onChange={handleProductChange}
                />
              </Stack>
            </SectionBlock>
          </Grid>
        </Grid>
      </Stack>
    </PageContainer>
  );
};

export default GenerationPage;
