import React, { useState } from "react";
import {
    Alert,
    Button,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import JSEncrypt from "jsencrypt";
import api, { pubApi } from "../api";
import SectionBlock from "./SectionBlock";

const ACCOUNT = "/api/v1/account";
const MIN_PASSWORD_LENGTH = 8;

/**
 * Own-password change for the signed-in account.
 *
 * Both passwords leave the browser RSA-encrypted with the gateway's public key
 * and are only decrypted inside the account service, which verifies the current
 * one against the stored hash before writing the new one. The username is never
 * sent: the server takes it from the caller's JWT, so this can only ever act on
 * the account making the request.
 */
const ChangePasswordCard = () => {
    const { t } = useTranslation();
    const [form, setForm] = useState({ current: "", next: "", confirm: "" });
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);

    const setField = (key) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [key]: value }));
        // a typed change clears that field's own complaint
        setFieldErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const validate = () => {
        const nextErrors = {};
        if (!form.current) {
            nextErrors.current = t("selfAccount.errors.currentRequired");
        }
        if (!form.next) {
            nextErrors.next = t("selfAccount.errors.newRequired");
        } else if (form.next.length < MIN_PASSWORD_LENGTH) {
            nextErrors.next = t("selfAccount.errors.tooShort");
        } else if (form.next === form.current) {
            nextErrors.next = t("selfAccount.errors.sameAsCurrent");
        }
        if (form.next !== form.confirm) {
            nextErrors.confirm = t("selfAccount.errors.mismatch");
        }
        setFieldErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    /** The gateway serves the key; only a non-empty value is ever cached. */
    const fetchPublicKey = async () => {
        const cached = sessionStorage.getItem("publicKey");
        if (cached) return cached;
        const response = await api.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
        const key = new TextDecoder().decode(response.data);
        if (key) sessionStorage.setItem("publicKey", key);
        return key;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        if (!validate()) return;

        setSaving(true);
        try {
            const publicKey = await fetchPublicKey();
            if (!publicKey) {
                throw new Error(t("selfAccount.errors.encryptFailed"));
            }
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(publicKey);
            const currentPassword = encryptor.encrypt(form.current);
            const newPassword = encryptor.encrypt(form.next);
            if (!currentPassword || !newPassword) {
                throw new Error(t("selfAccount.errors.encryptFailed"));
            }

            await pubApi.post(`${ACCOUNT}/password`, { currentPassword, newPassword });

            setForm({ current: "", next: "", confirm: "" });
            setNotice(t("selfAccount.passwordSuccess"));
        } catch (err) {
            const status = err?.response?.status;
            const message = err?.response?.data?.errorMessage;
            if (status === 403) {
                // the account service said the current password is wrong
                setFieldErrors({ current: message || t("selfAccount.errors.wrongCurrent") });
            } else if (status === 400) {
                setFieldErrors({ next: message || t("selfAccount.errors.tooShort") });
            } else {
                setError(message || err.message || t("selfAccount.errors.passwordFailed"));
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionBlock
            title={t("selfAccount.passwordTitle")}
            description={t("selfAccount.passwordDesc")}
        >
            <Stack spacing={2} component="form" onSubmit={handleSubmit}>
                {error && <Alert severity="error">{error}</Alert>}
                {notice && <Alert severity="success">{notice}</Alert>}

                <TextField
                    type="password"
                    label={t("selfAccount.currentPassword")}
                    value={form.current}
                    onChange={setField("current")}
                    error={Boolean(fieldErrors.current)}
                    helperText={fieldErrors.current}
                    autoComplete="current-password"
                    fullWidth
                />
                <TextField
                    type="password"
                    label={t("selfAccount.newPassword")}
                    value={form.next}
                    onChange={setField("next")}
                    error={Boolean(fieldErrors.next)}
                    helperText={fieldErrors.next || t("selfAccount.newPasswordHint")}
                    autoComplete="new-password"
                    fullWidth
                />
                <TextField
                    type="password"
                    label={t("selfAccount.confirmPassword")}
                    value={form.confirm}
                    onChange={setField("confirm")}
                    error={Boolean(fieldErrors.confirm)}
                    helperText={fieldErrors.confirm}
                    autoComplete="new-password"
                    fullWidth
                />

                <Typography variant="caption" color="text.secondary">
                    {t("selfAccount.passwordPrivacyHint")}
                </Typography>

                <Stack direction="row">
                    <Button type="submit" variant="contained" disabled={saving}>
                        {saving ? t("selfAccount.passwordSaving") : t("selfAccount.passwordSubmit")}
                    </Button>
                </Stack>
            </Stack>
        </SectionBlock>
    );
};

export default ChangePasswordCard;
