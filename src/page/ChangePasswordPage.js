import React, { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import api from "../api";
import JSEncrypt from "jsencrypt";
import { useTranslation } from "react-i18next";

const ChangePasswordPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const ticket = searchParams.get("ticket");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const { t } = useTranslation();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setSubmitting(true);

        if (!newPassword || newPassword.length < 8) {
            setError(t("changePassword.errors.tooShort"));
            setSubmitting(false);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError(t("changePassword.errors.mismatch"));
            setSubmitting(false);
            return;
        }

        try {
            let publicKey = sessionStorage.getItem("publicKey");
            if (publicKey === null) {
                const keyResponse = await api.get("/api/v1/auth/public-key", {
                    responseType: "arraybuffer",
                });
                publicKey = new TextDecoder().decode(keyResponse.data);
                sessionStorage.setItem("publicKey", publicKey);
            }
            if (!publicKey || !ticket) {
                throw new Error(t("changePassword.errors.preLogin"));
            }

            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(publicKey);
            const encryptedPassword = encryptor.encrypt(newPassword);

            const response = await api.post("/api/v1/auth/change-password", {
                ticket: ticket,
                encryptedPassword: encryptedPassword,
            });

            if (response.status === 200) {
                const message =
                    response.data?.message || t("changePassword.success");
                setSuccess(message);
                setTimeout(() => navigate("/login"), 2500);
            } else {
                setError(t("changePassword.errors.generic"));
            }
        } catch (err) {
            console.error("Change password error:", err);
            if (err.response && err.response.data && err.response.data.message) {
                setError(err.response.data.message);
            } else {
                setError(t("changePassword.errors.generic"));
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <PageContainer
            maxWidth="sm"
            sx={{
                display: "flex",
                alignItems: "center",
                minHeight: { xs: "calc(100dvh - 180px)", md: "calc(100dvh - 200px)" },
            }}
        >
            <CardWrapper sx={{ width: "100%" }}>
                <Stack spacing={3}>
                    <Stack spacing={1}>
                        <Typography variant="h3">{t("changePassword.title")}</Typography>
                        <Typography variant="body1" color="text.secondary">
                            {t("changePassword.subtitle")}
                        </Typography>
                    </Stack>

                    {error && <Alert severity="error">{error}</Alert>}
                    {success && <Alert severity="success">{success}</Alert>}

                    <Box component="form" onSubmit={handleSubmit}>
                        <Stack spacing={2}>
                            <TextField
                                label={t("changePassword.newPassword")}
                                type="password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                required
                            />
                            <TextField
                                label={t("changePassword.confirmPassword")}
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                required
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={submitting}
                            >
                                {t("changePassword.submitButton")}
                            </Button>
                        </Stack>
                    </Box>
                </Stack>
            </CardWrapper>
        </PageContainer>
    );
};

export default ChangePasswordPage;
