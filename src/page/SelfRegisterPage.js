import React, { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Grid,
    Link,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import JSEncrypt from "jsencrypt";
import api, { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import OnboardingSteps from "../components/OnboardingSteps";
import { useTranslation } from "react-i18next";

/**
 * Open self-registration. Unlike the invite register screen there is no
 * request uuid and no pre-created account: the visitor picks a username,
 * gives a contact email and sets their own password, then signs in and buys a
 * plan themselves.
 *
 * The password never leaves the browser in clear text - it is RSA-encrypted
 * with the same public key the login screen uses.
 */
const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SelfRegisterPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [form, setForm] = useState({ username: "", name: "", email: "", password: "", repeatPassword: "" });
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const update = (key) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [key]: value }));
        setFieldErrors((prev) => {
            const nextField = { ...prev, [key]: "" };
            if (key === "password" || key === "repeatPassword") {
                const password = key === "password" ? value : form.password;
                const repeat = key === "repeatPassword" ? value : form.repeatPassword;
                nextField.repeatPassword = repeat && password !== repeat ? t("selfRegister.errors.mismatch") : "";
                nextField.password =
                    key === "password" && value.length < MIN_PASSWORD_LENGTH ? t("selfRegister.errors.tooShort") : "";
            }
            if (key === "username" && value && !USERNAME_PATTERN.test(value.trim())) {
                nextField.username = t("selfRegister.errors.usernamePattern");
            }
            if (key === "email" && value && !EMAIL_PATTERN.test(value.trim())) {
                nextField.email = t("selfRegister.errors.emailInvalid");
            }
            return nextField;
        });
    };

    const validate = () => {
        const next = {};
        if (!USERNAME_PATTERN.test(form.username.trim())) {
            next.username = t("selfRegister.errors.usernamePattern");
        }
        if (!form.name.trim()) {
            next.name = t("selfRegister.errors.nameRequired");
        }
        if (!EMAIL_PATTERN.test(form.email.trim())) {
            next.email = t("selfRegister.errors.emailInvalid");
        }
        if (form.password.length < MIN_PASSWORD_LENGTH) {
            next.password = t("selfRegister.errors.tooShort");
        }
        if (form.repeatPassword !== form.password) {
            next.repeatPassword = t("selfRegister.errors.mismatch");
        }
        setFieldErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        if (!validate()) {
            return;
        }

        setSubmitting(true);
        try {
            // The gateway serves this key itself (/api/v1/auth/**), so it goes
            // through the plain instance rather than the /publiclink one. When
            // its key file is unreadable it answers 503 AUTH_008: without a key
            // no password can be encrypted, which is a different failure from
            // the account service being down.
            let publicKey = sessionStorage.getItem("publicKey");
            if (!publicKey) {
                let keyResponse;
                try {
                    keyResponse = await api.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
                } catch (keyErr) {
                    throw Object.assign(new Error("public key unavailable"), { keyUnavailable: true });
                }
                publicKey = new TextDecoder().decode(keyResponse.data);
                if (publicKey) {
                    sessionStorage.setItem("publicKey", publicKey);
                }
            }
            if (!publicKey) {
                throw Object.assign(new Error("public key empty"), { keyUnavailable: true });
            }
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(publicKey);
            const encryptedPassword = encryptor.encrypt(form.password);
            if (!encryptedPassword) {
                throw Object.assign(new Error(t("selfRegister.errors.encryptFailed")), { handledLocally: true });
            }

            await pubApi.post("/api/v1/publish/self-register", {
                username: form.username.trim(),
                name: form.name.trim(),
                email: form.email.trim(),
                password: encryptedPassword,
            });

            navigate("/login", {
                state: { accountCreated: true, username: form.username.trim(), next: "/plans" },
            });
        } catch (err) {
            console.error("Self-registration failed", err);
            setError(mapError(err));
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * The register endpoint answers with a readable message in the body and the
     * class of failure in the status, so both are used: the message when there is
     * one, the status when the body came back empty.
     */
    const mapError = (err) => {
        if (err?.keyUnavailable) return t("selfRegister.errors.keyUnavailable");

        const body = err?.response?.data;
        if (body?.message) return body.message;
        if (body?.errorMessage) return body.errorMessage;

        const status = err?.response?.status;
        if (status === 409) return t("selfRegister.errors.usernameTaken");
        if (status === 400) return t("selfRegister.errors.invalidInput");
        if (status === 502 || status === 503 || status === 504) return t("selfRegister.errors.serviceDown");
        if (err?.handledLocally) return t("selfRegister.errors.encryptFailed");
        if (!err?.response) return t("selfRegister.errors.noResponse");
        return t("selfRegister.errors.failed");
    };

    return (
        <PageContainer maxWidth="sm">
            <Stack spacing={3}>
                <OnboardingSteps activeStep={0} />

                <SectionBlock
                    title={t("selfRegister.title")}
                    description={t("selfRegister.subtitle")}
                >
                    <Stack spacing={3}>
                        {error && <Alert severity="error">{error}</Alert>}

                        <Box component="form" onSubmit={handleSubmit} noValidate>
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        label={t("selfRegister.username")}
                                        value={form.username}
                                        onChange={update("username")}
                                        error={Boolean(fieldErrors.username)}
                                        helperText={fieldErrors.username || t("selfRegister.usernameHint")}
                                        required
                                        fullWidth
                                        autoComplete="username"
                                        disabled={submitting}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        label={t("selfRegister.name")}
                                        value={form.name}
                                        onChange={update("name")}
                                        error={Boolean(fieldErrors.name)}
                                        helperText={fieldErrors.name || t("selfRegister.nameHint")}
                                        required
                                        fullWidth
                                        autoComplete="name"
                                        disabled={submitting}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        label={t("selfRegister.email")}
                                        type="email"
                                        value={form.email}
                                        onChange={update("email")}
                                        error={Boolean(fieldErrors.email)}
                                        helperText={fieldErrors.email || t("selfRegister.emailHint")}
                                        required
                                        fullWidth
                                        autoComplete="email"
                                        disabled={submitting}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        label={t("selfRegister.password")}
                                        type="password"
                                        value={form.password}
                                        onChange={update("password")}
                                        error={Boolean(fieldErrors.password)}
                                        helperText={fieldErrors.password || t("selfRegister.passwordHint")}
                                        required
                                        fullWidth
                                        autoComplete="new-password"
                                        disabled={submitting}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        label={t("selfRegister.repeatPassword")}
                                        type="password"
                                        value={form.repeatPassword}
                                        onChange={update("repeatPassword")}
                                        error={Boolean(fieldErrors.repeatPassword)}
                                        helperText={fieldErrors.repeatPassword || ""}
                                        required
                                        fullWidth
                                        autoComplete="new-password"
                                        disabled={submitting}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <Button
                                        type="submit"
                                        variant="contained"
                                        size="large"
                                        fullWidth
                                        disabled={submitting}
                                    >
                                        {submitting ? t("selfRegister.submitting") : t("selfRegister.submit")}
                                    </Button>
                                </Grid>
                            </Grid>
                        </Box>

                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                {t("selfRegister.afterNote")}
                            </Typography>
                            <Typography variant="body2">
                                <Link component={RouterLink} to="/login">
                                    {t("selfRegister.loginLink")}
                                </Link>
                            </Typography>
                        </Stack>
                    </Stack>
                </SectionBlock>
            </Stack>
        </PageContainer>
    );
};

export default SelfRegisterPage;
