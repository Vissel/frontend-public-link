import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
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
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import ChangePasswordCard from "../components/ChangePasswordCard";
import TransferInfoManager from "../components/TransferInfoManager";
import YogaPlansManager from "../components/YogaPlansManager";
import { useTranslation } from "react-i18next";

const ACCOUNT = "/api/v1/account";
const SELLER_PLAN = "/api/v1/sellerPlan";

const formatVND = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return num.toLocaleString("en-US");
};

/** The quota number in the unit the package itself counts. */
const usedOf = (plan) => (plan.quotaType === "BOOKINGS" ? plan.usedBookings : plan.usedDays);

// Same rules the server applies (SelfAccountService.normalizeEmail), so a bad
// address is caught while it is being typed instead of after a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 100;

/** "" when the address is acceptable or absent, otherwise the reason key. */
const emailProblem = (value) => {
    const email = (value || "").trim();
    if (!email) return "";
    if (email.length > MAX_EMAIL_LENGTH) return "tooLong";
    if (!EMAIL_PATTERN.test(email)) return "invalid";
    if (email.startsWith(".") || email.endsWith(".") || email.includes("..")) return "invalid";
    if (email[email.indexOf("@") - 1] === ".") return "invalid";
    return "";
};

/**
 * The account's own page, opened from the identity block of the header account
 * menu. It replaces the old seller setup screen and serves both roles: the
 * display name and (one-time) email every account may set, then the payment
 * plans that pay for what the account does - the plans a seller bought, or the
 * packages a seller issued to a buyer. Sellers also keep their transfer
 * accounts and yoga packages here.
 */
const SelfAccountPage = () => {
    const { t } = useTranslation();
    const { userRole } = useAuth();

    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({ name: "", email: "" });
    const [sellerPlans, setSellerPlans] = useState([]);
    const [packages, setPackages] = useState([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const isSeller = String(profile?.role || userRole || "").toUpperCase() === "SELLER";
    const dirty = Boolean(profile)
        && (form.name !== (profile.name || "") || form.email !== (profile.email || ""));
    // a locked email is shown as stored and is never re-validated
    const emailProblemKey = profile?.emailLocked ? "" : emailProblem(form.email);
    const emailErrorText = emailProblemKey === "tooLong"
        ? t("selfAccount.errors.emailTooLong")
        : emailProblemKey
            ? t("selfAccount.errors.emailInvalid")
            : "";

    const loadProfile = useCallback(async () => {
        try {
            const res = await pubApi.get(`${ACCOUNT}/self`);
            const next = res.data || null;
            setProfile(next);
            setForm({ name: next?.name || "", email: next?.email || "" });
            return next;
        } catch (err) {
            console.error("Failed to load own profile", err);
            setError(err?.response?.data?.errorMessage || t("selfAccount.errors.load"));
            return null;
        }
    }, [t]);

    const loadPlans = useCallback(async (asSeller) => {
        try {
            if (asSeller) {
                const res = await pubApi.get(`${SELLER_PLAN}/myPlans`);
                setSellerPlans(res.data?.items || []);
            } else {
                const res = await pubApi.get(`${ACCOUNT}/myPackages`);
                setPackages(res.data || []);
            }
        } catch (err) {
            console.error("Failed to load own plans", err);
            setError(err?.response?.data?.errorMessage || t("selfAccount.errors.load"));
        }
    }, [t]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            const next = await loadProfile();
            if (cancelled) return;
            const seller = String(next?.role || userRole || "").toUpperCase() === "SELLER";
            await loadPlans(seller);
            if (!cancelled) setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [loadProfile, loadPlans, userRole]);

    const handleSaveProfile = async () => {
        if (!form.name.trim()) {
            setError(t("selfAccount.nameRequired"));
            return;
        }
        if (emailProblem(form.email)) {
            // the field already says why and the button is disabled; this only
            // keeps a stale state from ever reaching the server
            return;
        }
        setSaving(true);
        setError("");
        try {
            const res = await pubApi.post(`${ACCOUNT}/profile`, {
                name: form.name.trim(),
                // an account that already has an email never sends a different one
                email: profile?.emailLocked ? undefined : form.email.trim(),
            });
            const next = res.data || null;
            if (next) {
                setProfile(next);
                setForm({ name: next.name || "", email: next.email || "" });
            }
            setNotice(t("selfAccount.saved"));
        } catch (err) {
            console.error("Save profile failed", err);
            setError(err?.response?.data?.errorMessage || t("selfAccount.errors.save"));
        } finally {
            setSaving(false);
        }
    };

    const planRows = useMemo(() => (isSeller ? sellerPlans : packages), [isSeller, sellerPlans, packages]);

    return (
        <PageContainer maxWidth="md">
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h3" gutterBottom>
                        {t("selfAccount.title")}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t("selfAccount.subtitle")}
                    </Typography>
                </Box>

                {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
                {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

                <SectionBlock
                    title={t("selfAccount.accountTitle")}
                    description={t("selfAccount.accountDesc")}
                >
                    <Stack spacing={2}>
                        {/* The login name identifies the account everywhere and
                            is never editable. The role is not displayed: it is
                            what already decides which sections this page shows. */}
                        <TextField
                            size="small"
                            label={t("selfAccount.username")}
                            value={profile?.username || ""}
                            disabled
                            fullWidth
                        />

                        <TextField
                            label={t("selfAccount.fullName")}
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            fullWidth
                            required
                        />

                        <TextField
                            label={t("selfAccount.email")}
                            value={form.email}
                            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                            fullWidth
                            disabled={Boolean(profile?.emailLocked)}
                            error={Boolean(emailErrorText)}
                            helperText={emailErrorText || (profile?.emailLocked
                                ? t("selfAccount.emailLockedHint")
                                : t("selfAccount.emailAddHint"))}
                        />

                        <Stack direction="row">
                            <Button
                                variant="contained"
                                onClick={handleSaveProfile}
                                disabled={saving || loading || !dirty || Boolean(emailProblemKey)}
                            >
                                {saving ? t("common.saving") : t("selfAccount.saveProfile")}
                            </Button>
                        </Stack>
                    </Stack>
                </SectionBlock>

                <ChangePasswordCard />

                <SectionBlock
                    title={isSeller ? t("selfAccount.plansTitle") : t("selfAccount.packagesTitle")}
                    description={isSeller ? t("selfAccount.plansDesc") : t("selfAccount.packagesDesc")}
                >
                    <TableContainer sx={{ overflowX: "auto" }}>
                        <Table size="small" sx={{ minWidth: 700 }}>
                            <TableHead>
                                <TableRow>
                                    {isSeller ? (
                                        <>
                                            <TableCell align="right">{t("setup.column.fee")}</TableCell>
                                            <TableCell align="center">{t("setup.column.days")}</TableCell>
                                            <TableCell align="center">{t("setup.column.quota")}</TableCell>
                                            <TableCell>{t("setup.column.state")}</TableCell>
                                            <TableCell>{t("setup.column.activeDate")}</TableCell>
                                            <TableCell>{t("setup.column.endedDate")}</TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell>{t("selfAccount.package")}</TableCell>
                                            <TableCell>{t("selfAccount.seller")}</TableCell>
                                            <TableCell align="center">{t("yogaPlans.quota")}</TableCell>
                                            <TableCell align="right">{t("yogaPlans.amount")}</TableCell>
                                            <TableCell>{t("setup.column.state")}</TableCell>
                                        </>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {planRows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={isSeller ? 6 : 5}>
                                            <Typography variant="body2" color="text.secondary">
                                                {loading
                                                    ? t("common.loading")
                                                    : isSeller ? t("selfAccount.empty") : t("selfAccount.packagesEmpty")}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {isSeller
                                    ? sellerPlans.map((plan) => (
                                        <TableRow key={plan.planUserCode} hover>
                                            <TableCell align="right">{formatVND(plan.fee)}</TableCell>
                                            <TableCell align="center">{plan.planDay}</TableCell>
                                            <TableCell align="center">{plan.usedCount}/{plan.envQuota}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    color={plan.remaining > 0 ? "success" : "default"}
                                                    label={`${t("selfAccount.remaining")} ${plan.remaining}`}
                                                    onClick={() => { }}
                                                    clickable={false}
                                                />
                                            </TableCell>
                                            <TableCell>{plan.activeDate || "\u2014"}</TableCell>
                                            <TableCell>{plan.endedDate || "\u2014"}</TableCell>
                                        </TableRow>
                                    ))
                                    : packages.map((plan) => (
                                        <TableRow key={plan.sellerPlanCode} hover>
                                            <TableCell>{plan.productName || plan.envId}</TableCell>
                                            <TableCell>{plan.sellerUsername}</TableCell>
                                            <TableCell align="center">
                                                <Stack spacing={0.25}>
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        {usedOf(plan)}/{plan.totalDays}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {plan.quotaType === "BOOKINGS"
                                                            ? t("yogaPlans.daysUsed", { count: plan.usedDays })
                                                            : t("yogaPlans.bookingsUsed", { count: plan.usedBookings })}
                                                    </Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell align="right">{formatVND(plan.amountVnd)} VND</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    color={plan.state === "ACTIVE" ? "success" : "default"}
                                                    label={plan.state === "ACTIVE" ? t("common.active") : t("common.inactive")}
                                                    onClick={() => { }}
                                                    clickable={false}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </SectionBlock>

                {isSeller && (
                    <>
                        <SectionBlock
                            title={t("selfAccount.yogaPlansTitle")}
                            description={t("selfAccount.yogaPlansDesc")}
                        >
                            <YogaPlansManager />
                        </SectionBlock>

                        <SectionBlock
                            title={t("selfAccount.transferTitle")}
                            description={t("selfAccount.transferDesc")}
                        >
                            <TransferInfoManager />
                        </SectionBlock>
                    </>
                )}
            </Stack>
        </PageContainer>
    );
};

export default SelfAccountPage;
