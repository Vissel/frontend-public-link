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
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import JSEncrypt from "jsencrypt";
import api, { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import OnboardingSteps from "../components/OnboardingSteps";
import { useTranslation } from "react-i18next";

/**
 * Open self-registration. Unlike the invite register screen there is no
 * request uuid and no pre-created account: the visitor picks a username, may
 * give a name and a contact email, and sets their own password.
 *
 * What happens next depends on where the visitor came from. A visitor from a
 * public sale space (a seller's product page, a yoga timetable or a court
 * grid) is registering as a buyer: no seller steps, and after signing in they
 * go straight back to that page. A seller keeps the three-step onboarding,
 * and the "what will you sell" question that used to live here is now asked
 * on the plan screen (step 2).
 *
 * The password never leaves the browser in clear text - it is RSA-encrypted
 * with the same public key the login screen uses.
 */
const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * A duplicate account is answered with the input that clashes, so the refusal
 * can be attached to that field. The wording lives here rather than in the
 * banner: it has to name the thing the visitor should change.
 */
const DUPLICATE_FIELD_KEYS = {
    username: "selfRegister.errors.duplicateUsername",
    email: "selfRegister.errors.duplicateEmail",
    name: "selfRegister.errors.duplicateName",
};

const SelfRegisterPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // Where the visitor came from, when a public page handed its own URL over.
    // It is only a return offer - the plan step still runs first - so it is
    // kept apart from the default post-login target.
    const returnPath = searchParams.get("next") || "";
    const nextPath = returnPath || "/plans";
    // A visitor arriving from a public sale space (a seller's product page,
    // yoga timetable or court grid) is registering as a buyer: the seller
    // onboarding steps disappear, the account is created as BUYER, and after
    // login they go straight back to that page - register, sign in, return.
    const isPlayerReturn =
        nextPath.startsWith("/api/v1/publish/saleUrl") || nextPath.startsWith("/publink");

    const [form, setForm] = useState({
        username: "",
        name: "",
        email: "",
        password: "",
        repeatPassword: "",
    });
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
        // Name and email are optional: the backend falls back to the username
        // for the display name, and a blank email simply means no follow-up
        // mail. What is typed still has to be well formed.
        if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
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
                // A visitor from a public sale space becomes a BUYER who goes
                // straight back to it; a standalone registration keeps the
                // SELLER default. The plan purpose is never sent: the question
                // moved to the plan screen, which asks it before the catalog.
                role: isPlayerReturn ? "BUYER" : "SELLER",
            });

            navigate("/login", {
                // `next` is only the page the visitor left, never the "/plans"
                // default: the plan screen offers it as a way back out, and a
                // default would make that button point at itself.
                state: {
                    accountCreated: true,
                    username: form.username.trim(),
                    next: returnPath || undefined,
                },
            });
        } catch (err) {
            console.error("Self-registration failed", err);
            // Username, email or full name already in use: mark that field with
            // its own message instead of a banner, so the next step (the login
            // and the plan) stays blocked until the visitor changes it.
            const duplicateField =
                err?.response?.status === 409 ? err.response.data?.field : "";
            const duplicateKey = DUPLICATE_FIELD_KEYS[duplicateField];
            if (duplicateKey) {
                setFieldErrors((prev) => ({ ...prev, [duplicateField]: t(duplicateKey) }));
                setError("");
                return;
            }
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
                {!isPlayerReturn && <OnboardingSteps activeStep={0} />}

                <SectionBlock
                    title={isPlayerReturn ? t("selfRegister.playerTitle") : t("selfRegister.title")}
                    description={isPlayerReturn ? t("selfRegister.playerSubtitle") : t("selfRegister.subtitle")}
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
                                {isPlayerReturn
                                    ? t("selfRegister.playerAfterNote")
                                    : t("selfRegister.afterNote")}
                            </Typography>
                            <Typography variant="body2">
                                <Link component={RouterLink} to={`/login?next=${encodeURIComponent(nextPath)}`}>
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
