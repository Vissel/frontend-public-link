import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Button,
    Card,
    CardActionArea,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    MenuItem,
    Stack,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";
import PaymentInfoPanel from "../components/PaymentInfoPanel";
import { formatVND } from "../util/clipboard";
import {
    groupColor,
    homeRouteFor,
    normalizeGroup,
} from "../util/planGroup";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

/** How often the screen asks whether the admin has verified the transfer. */
const POLL_INTERVAL_MS = 20000;

/** Same sanity bound the backend enforces on one extension order. */
const MAX_EXTEND_DAYS = 3650;

// The backend owns the vocabulary; this screen only ever branches on "is there
// an order to pay", so READY is not named here - an answer the UI does not know
// still shows the form rather than a blank page.
const STATE_WAITING_TRANSFER = "WAITING_TRANSFER";
const STATE_WAITING_CONFIRM = "WAITING_CONFIRM";

const toTime = (value) => {
    if (!value) return null;
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isOpenOrderState = (state) =>
    state?.state === STATE_WAITING_TRANSFER || state?.state === STATE_WAITING_CONFIRM;

const formatDate = (date) =>
    date ? `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}` : "—";

/**
 * "More plan": buy capacity on top of a plan that is already running.
 *
 * Two ways to spend more, one screen: another catalog plan (extra product
 * links and their days, which stack on the running one because quota is summed
 * and coverage takes the latest end date) or extra days on a plan already
 * owned, priced at its daily rate. Both open an ordinary order that the admin
 * verifies from the "Waiting for pay" queue, so nothing about the money side
 * changes here.
 *
 * Whatever is open, the backend answers with the state and the transfer
 * instructions; the UI never works out the payment status itself.
 */
const MorePlanPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { userRole } = useAuth();

    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [tab, setTab] = useState(0);
    // Set once an open order settles while the screen is watching, so the
    // account is told the money was accepted instead of staring at a form.
    const [settled, setSettled] = useState(false);

    const [plans, setPlans] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogLoaded, setCatalogLoaded] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    // Bumped by the catalog retry: the fetch below is guarded by state flags, so
    // asking for a retry while the catalog is still empty - and catalogLoaded is
    // already false - would otherwise not retrigger it.
    const [catalogAttempt, setCatalogAttempt] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState("");
    const [buying, setBuying] = useState(false);

    const [extendTarget, setExtendTarget] = useState("");
    const [extendDays, setExtendDays] = useState("1");
    const [extending, setExtending] = useState(false);

    // Conversion. The target list follows the group of the plan being converted,
    // so a booking plan can only ever become another booking plan here.
    const [convertSource, setConvertSource] = useState("");
    const [convertTarget, setConvertTarget] = useState("");
    const [convertTargets, setConvertTargets] = useState([]);
    const [convertLoading, setConvertLoading] = useState(false);
    const [convertError, setConvertError] = useState("");
    const [converting, setConverting] = useState(false);

    const loadState = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError("");
        try {
            const res = await pubApi.get("/api/v1/sellerPlan/moreState");
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to load the plan overview", err);
            setError(err?.response?.data?.message || t("morePlan.errors.load"));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [t]);

    useEffect(() => {
        loadState();
    }, [loadState]);

    const isOpenOrder = isOpenOrderState(state);

    // The group this account registered to buy from, so the buy tab offers the
    // same price list the onboarding screen did and not the other one.
    const purpose = normalizeGroup(state?.planPurpose);
    const purposeColor = groupColor(purpose);

    // The order leaving the open list is the admin marking it paid, which is the
    // news the polling waits for. Tracked from an effect rather than inside the
    // fetch, so nothing else has to happen while a state updater runs.
    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (wasOpenRef.current && state && !isOpenOrder) {
            setSettled(true);
        }
        wasOpenRef.current = isOpenOrder;
    }, [isOpenOrder, state]);

    // The admin activation is invisible until someone asks, so while an order is
    // open the screen keeps asking.
    useEffect(() => {
        if (!isOpenOrder) {
            return undefined;
        }
        const timer = setInterval(() => {
            loadState({ quiet: true });
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [isOpenOrder, loadState]);

    useEffect(() => {
        // The catalog barely changes, so it is fetched once and kept.
        // catalogLoading is deliberately NOT a dependency: it is set to true in
        // this very effect, and React would then run the cleanup below and mark
        // the in-flight request cancelled - the spinner would never stop even
        // though the catalog arrived.
        if (catalogLoaded || plans.length > 0 || isOpenOrder) {
            return undefined;
        }
        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError("");
        pubApi
            .get("/api/v1/publish/plans", { params: { group: purpose } })
            .then((res) => {
                if (!cancelled) {
                    setPlans(res.data?.items || []);
                    setCatalogLoaded(true);
                }
            })
            .catch((err) => {
                console.error("Failed to load the plan catalog", err);
                if (!cancelled) {
                    setCatalogError(t("morePlan.errors.catalog"));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setCatalogLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [catalogLoaded, plans.length, isOpenOrder, catalogAttempt, purpose, t]);

    // Wrapped in its own memo: `state?.activePlans || []` would otherwise hand
    // the memo below a fresh array on every render and defeat it.
    const activePlans = useMemo(() => state?.activePlans || [], [state]);
    // An extension order cannot be extended, and a conversion order is already
    // spent, so the pickers offer exactly what the backend would accept.
    const plainPlans = useMemo(
        () => activePlans.filter((plan) => plan.extendDays == null && plan.convertsPlanUserCode == null),
        [activePlans]
    );
    const extendablePlans = plainPlans;

    const chosenConvertSource = useMemo(
        () => plainPlans.find((plan) => plan.planUserCode === convertSource) || null,
        [plainPlans, convertSource]
    );
    const convertSourceGroup = normalizeGroup(chosenConvertSource?.planGroup);
    const chosenConvertTarget = useMemo(
        () => convertTargets.find((plan) => plan.planCode === convertTarget) || null,
        [convertTargets, convertTarget]
    );
    /**
     * What the seller still owes: the new plan's fee minus what the running one
     * cost. Zero or negative means nothing is charged and the surplus is lost,
     * which the screen has to say plainly before the account agrees to it.
     */
    const convertDelta = useMemo(() => {
        if (!chosenConvertSource || !chosenConvertTarget) {
            return null;
        }
        return Number(chosenConvertTarget.fee) - Number(chosenConvertSource.fee);
    }, [chosenConvertSource, chosenConvertTarget]);

    const chosenExtend = useMemo(
        () => extendablePlans.find((plan) => plan.planUserCode === extendTarget) || null,
        [extendablePlans, extendTarget]
    );

    const parsedDays = useMemo(() => {
        const value = parseInt(extendDays, 10);
        return Number.isNaN(value) || value <= 0 ? null : value;
    }, [extendDays]);

    const extendPreview = useMemo(() => {
        if (!chosenExtend || !parsedDays) {
            return null;
        }
        const planDay = Number(chosenExtend.planDay) || 0;
        const fee = Number(chosenExtend.fee) || 0;
        // Same rule as the backend: daily rate rounded up, so a short extension
        // of a cheap plan never collapses to zero.
        const amount = planDay > 0 && fee > 0 ? Math.ceil((fee * parsedDays) / planDay) : fee;
        const currentEnd = toTime(chosenExtend.endedDate);
        // A plan that already ran out is extended from today, not from a past date.
        const base = currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
        const next = new Date(base.getTime());
        next.setDate(next.getDate() + parsedDays);
        return { amount, from: formatDate(base), to: formatDate(next) };
    }, [chosenExtend, parsedDays]);

    const handleBuy = async () => {
        if (!selectedPlan) {
            setError(t("morePlan.errors.pickFirst"));
            return;
        }
        setError("");
        setBuying(true);
        try {
            const res = await pubApi.post("/api/v1/sellerPlan/buyMore", { planCode: selectedPlan });
            setSelectedPlan("");
            setSettled(false);
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to open the extra plan order", err);
            setError(err?.response?.data?.message || t("morePlan.errors.buy"));
        } finally {
            setBuying(false);
        }
    };

    const handleExtend = async () => {
        if (!chosenExtend) {
            setError(t("morePlan.errors.pickTarget"));
            return;
        }
        if (!parsedDays) {
            setError(t("morePlan.errors.daysInvalid"));
            return;
        }
        setError("");
        setExtending(true);
        try {
            const res = await pubApi.post("/api/v1/sellerPlan/extendMore", {
                planUserCode: chosenExtend.planUserCode,
                days: parsedDays,
            });
            setSettled(false);
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to open the extension order", err);
            setError(err?.response?.data?.message || t("morePlan.errors.extend"));
        } finally {
            setExtending(false);
        }
    };

    // Conversion targets follow the group of the plan being converted, fetched
    // when the seller picks one. The plan already owned is dropped from the list:
    // converting a plan onto itself would owe nothing and change nothing.
    useEffect(() => {
        if (!chosenConvertSource) {
            setConvertTargets([]);
            setConvertTarget("");
            return undefined;
        }
        let cancelled = false;
        setConvertLoading(true);
        setConvertError("");
        setConvertTarget("");
        pubApi
            .get("/api/v1/publish/plans", { params: { group: convertSourceGroup } })
            .then((res) => {
                if (!cancelled) {
                    setConvertTargets((res.data?.items || []).filter((plan) => plan.planCode !== chosenConvertSource.planCode));
                }
            })
            .catch((err) => {
                console.error("Failed to load the conversion targets", err);
                if (!cancelled) {
                    setConvertError(t("morePlan.errors.catalog"));
                    setConvertTargets([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setConvertLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [chosenConvertSource, convertSourceGroup, t]);

    const handleConvert = async () => {
        if (!chosenConvertSource || !chosenConvertTarget) {
            setConvertError(t("morePlan.convert.pickBoth"));
            return;
        }
        setConvertError("");
        setConverting(true);
        try {
            const res = await pubApi.post("/api/v1/sellerPlan/convert", {
                planUserCode: chosenConvertSource.planUserCode,
                targetPlanCode: chosenConvertTarget.planCode,
            });
            const next = res.data || null;
            setSettled(false);
            setConvertTarget("");
            setConvertSource("");
            setState(next);
            if (next?.conversionOutcome?.result === "NO_PAYMENT") {
                // Nothing to transfer: say so on the home screen rather than on a
                // page the account is about to leave, so the confirmation survives
                // the navigation and is not swallowed by an unmount.
                navigate(homeRouteFor(userRole), {
                    state: { planConverted: next.conversionOutcome },
                });
                return;
            }
            setTab(0);
        } catch (err) {
            console.error("Failed to open the conversion order", err);
            setConvertError(err?.response?.data?.message || t("morePlan.errors.convert"));
        } finally {
            setConverting(false);
        }
    };

    const handleConfirmed = useCallback(
        (result) => {
            setState((prev) =>
                prev
                    ? {
                        ...prev,
                        state: STATE_WAITING_CONFIRM,
                        pendingPayment: prev.pendingPayment
                            ? { ...prev.pendingPayment, status: result?.status || "WAITING_CONFIRM" }
                            : prev.pendingPayment,
                    }
                    : prev
            );
        },
        []
    );

    const handleConfirmError = useCallback(
        (err) => setError(err?.response?.data?.message || t("payment.errors.confirm")),
        [t]
    );

    if (loading) {
        return (
            <PageContainer maxWidth="md">
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        {t("common.loading")}
                    </Typography>
                </Stack>
            </PageContainer>
        );
    }

    const pending = state?.pendingPayment;

    return (
        <PageContainer maxWidth="md">
            <Stack spacing={3}>
                <CardWrapper>
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                            <Typography variant="h4">{t("morePlan.title")}</Typography>
                            {refreshing && <CircularProgress size={16} />}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {t("morePlan.subtitle")}
                        </Typography>
                    </Stack>
                </CardWrapper>

                {error && (
                    <Alert
                        severity="error"
                        sx={{ alignItems: "center" }}
                        action={
                            <Button color="inherit" size="small" onClick={() => loadState()}>
                                {t("morePlan.retry")}
                            </Button>
                        }
                    >
                        {error}
                    </Alert>
                )}

                {settled && !isOpenOrder && (
                    <Alert
                        severity="success"
                        onClose={() => setSettled(false)}
                        action={
                            <Button color="inherit" size="small" onClick={() => loadState()}>
                                {t("morePlan.retry")}
                            </Button>
                        }
                    >
                        {t("morePlan.activated")}
                    </Alert>
                )}

                <CardWrapper>
                    <Stack spacing={2}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {t("morePlan.summaryTitle")}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {/* MUI 7 Chip calls onClick unconditionally, so even a
                                decorative chip needs a callable handler. */}
                            <Chip
                                size="small"
                                color={(state?.remainingQuota || 0) > 0 ? "success" : "default"}
                                onClick={() => { }}
                                clickable={false}
                                label={`${t("morePlan.remaining")}: ${state?.remainingQuota ?? 0}`}
                            />
                            <Chip
                                size="small"
                                variant="outlined"
                                onClick={() => { }}
                                clickable={false}
                                label={`${t("morePlan.coverage")}: ${formatDate(toTime(state?.coverageEndDate))}`}
                            />
                        </Stack>

                        {activePlans.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                {t("morePlan.noPlans")}
                            </Typography>
                        ) : (
                            <TableContainer sx={{ overflowX: "auto" }}>
                                <Table size="small" sx={{ minWidth: 640 }}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell align="right">{t("setup.column.fee")}</TableCell>
                                            <TableCell align="center">{t("setup.column.days")}</TableCell>
                                            <TableCell align="center">{t("setup.column.quota")}</TableCell>
                                            <TableCell>{t("setup.column.planGroup")}</TableCell>
                                            <TableCell>{t("setup.column.activeDate")}</TableCell>
                                            <TableCell>{t("setup.column.endedDate")}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {activePlans.map((plan) => (
                                            <TableRow key={plan.planUserCode} hover>
                                                <TableCell align="right">{formatVND(plan.fee)}</TableCell>
                                                <TableCell align="center">{plan.planDay}</TableCell>
                                                <TableCell align="center">
                                                    {plan.usedCount}/{plan.envQuota}
                                                </TableCell>
                                                <TableCell>
                                                    {/* An account may hold plans of both
                                                        groups; without this the two price
                                                        lists look like one. */}
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        color={groupColor(plan.planGroup)}
                                                        onClick={() => { }}
                                                        clickable={false}
                                                        label={t(`plans.group.${normalizeGroup(plan.planGroup)}.label`)}
                                                    />
                                                </TableCell>
                                                <TableCell>{plan.activeDate || "—"}</TableCell>
                                                <TableCell>{plan.endedDate || "—"}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Stack>
                </CardWrapper>

                {isOpenOrder && !pending && (
                    // The order exists but its transfer details could not be assembled -
                    // most likely the payment link aged out and could not be rebuilt.
                    // Saying so beats showing an empty screen, and it must not invite a
                    // second order for the same plan.
                    <Alert severity="warning">
                        <Stack spacing={1}>
                            <Typography variant="body2">{t("morePlan.orderWithoutInstructions")}</Typography>
                            <Button variant="outlined" size="small" onClick={() => loadState()} sx={{ alignSelf: "flex-start" }}>
                                {t("morePlan.retry")}
                            </Button>
                        </Stack>
                    </Alert>
                )}

                {isOpenOrder && pending && (
                    <>
                        {state.state === STATE_WAITING_CONFIRM && (
                            <Alert severity="info">
                                <Stack spacing={0.5}>
                                    <Chip size="small" color="info" onClick={() => { }} clickable={false} label={t("payment.status.waiting")} />
                                    <Typography variant="body2">{t("morePlan.waitingMessage")}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t("morePlan.pollingNote")}
                                    </Typography>
                                </Stack>
                            </Alert>
                        )}
                        {pending.status === "PAID" && (
                            <Alert severity="success">{t("payment.status.paid")}</Alert>
                        )}
                        <PaymentInfoPanel
                            info={pending}
                            token={pending.paymentToken}
                            status={pending.status}
                            defaultEmail={state.contactEmail || ""}
                            onConfirmed={handleConfirmed}
                            onError={handleConfirmError}
                        />
                    </>
                )}

                {!isOpenOrder && state && (
                    <CardWrapper>
                        <Stack spacing={2}>
                            <Tabs value={tab} onChange={(event, value) => setTab(value)}>
                                <Tab label={t("morePlan.tabs.buy")} />
                                <Tab label={t("morePlan.tabs.extend")} />
                                <Tab label={t("morePlan.tabs.convert")} />
                            </Tabs>

                            {tab === 0 && (
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Chip
                                            size="small"
                                            color={purposeColor}
                                            onClick={() => { }}
                                            clickable={false}
                                            label={t(`plans.group.${purpose}.label`)}
                                        />
                                        <Typography variant="body2" color="text.secondary">
                                            {t("morePlan.catalogHint")}
                                        </Typography>
                                    </Stack>

                                    {catalogLoading && (
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <CircularProgress size={18} />
                                            <Typography variant="body2" color="text.secondary">
                                                {t("common.loading")}
                                            </Typography>
                                        </Stack>
                                    )}

                                    {!catalogLoading && catalogError && (
                                        <Alert severity="error" sx={{ alignItems: "center" }}>
                                            <Stack spacing={1}>
                                                <Typography variant="body2">{catalogError}</Typography>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => {
                                                        setCatalogError("");
                                                        setCatalogLoaded(false);
                                                        setCatalogAttempt((attempt) => attempt + 1);
                                                    }}
                                                >
                                                    {t("morePlan.retry")}
                                                </Button>
                                            </Stack>
                                        </Alert>
                                    )}

                                    {!catalogLoading && !catalogError && plans.length === 0 && (
                                        <Alert severity="info">{t("morePlan.catalogEmpty")}</Alert>
                                    )}

                                    {!catalogLoading && plans.length > 0 && (
                                        <Grid container spacing={2}>
                                            {plans.map((plan) => {
                                                const isSelected = selectedPlan === plan.planCode;
                                                return (
                                                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.planCode}>
                                                        <Card
                                                            variant="outlined"
                                                            sx={{
                                                                height: "100%",
                                                                borderColor: isSelected ? "primary.main" : "divider",
                                                                borderWidth: isSelected ? 2 : 1,
                                                            }}
                                                        >
                                                            <CardActionArea onClick={() => setSelectedPlan(plan.planCode)} sx={{ height: "100%" }}>
                                                                <Stack spacing={1} sx={{ p: 2 }}>
                                                                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                                                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                                                            {formatVND(plan.fee)} VND
                                                                        </Typography>
                                                                        {isSelected && (
                                                                            <Chip
                                                                                size="small"
                                                                                color="primary"
                                                                                onClick={() => { }}
                                                                                clickable={false}
                                                                                label={t("morePlan.selected")}
                                                                            />
                                                                        )}
                                                                    </Stack>
                                                                    <Typography variant="body2" color="text.secondary">
                                                                        {plan.planDay} {t("payment.unit.day")} · {plan.envCount} {t("payment.unit.link")}
                                                                    </Typography>
                                                                    {plan.description && (
                                                                        <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                                                                            {plan.description}
                                                                        </Typography>
                                                                    )}
                                                                </Stack>
                                                            </CardActionArea>
                                                        </Card>
                                                    </Grid>
                                                );
                                            })}
                                        </Grid>
                                    )}

                                    <Divider />
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
                                        <Button
                                            variant="contained"
                                            size="large"
                                            color={purposeColor}
                                            onClick={handleBuy}
                                            disabled={buying || !selectedPlan || plans.length === 0}
                                        >
                                            {buying ? t("morePlan.buying") : t("morePlan.continueToPayment")}
                                        </Button>
                                        <Typography variant="caption" color="text.secondary">
                                            {t("morePlan.transferGuide")}
                                        </Typography>
                                    </Stack>
                                </Stack>
                            )}

                            {tab === 1 && (
                                <Stack spacing={2}>
                                    {extendablePlans.length === 0 ? (
                                        <Alert severity="info">{t("morePlan.extend.noActivePlan")}</Alert>
                                    ) : (
                                        <>
                                            <Typography variant="body2" color="text.secondary">
                                                {t("morePlan.extend.hint")}
                                            </Typography>

                                            <TextField
                                                select
                                                size="small"
                                                label={t("morePlan.extend.target")}
                                                value={extendTarget}
                                                onChange={(event) => setExtendTarget(event.target.value)}
                                            >
                                                {extendablePlans.map((plan) => (
                                                    <MenuItem key={plan.planUserCode} value={plan.planUserCode}>
                                                        {`${formatVND(plan.fee)} VND · ${plan.planDay} ${t("payment.unit.day")} · ${t("morePlan.extend.until")} ${plan.endedDate || "—"}`}
                                                    </MenuItem>
                                                ))}
                                            </TextField>

                                            <TextField
                                                size="small"
                                                type="number"
                                                label={t("morePlan.extend.days")}
                                                value={extendDays}
                                                onChange={(event) => setExtendDays(event.target.value)}
                                                inputProps={{ min: 1, max: MAX_EXTEND_DAYS, step: 1 }}
                                                sx={{ maxWidth: 220 }}
                                            />

                                            {extendPreview ? (
                                                <Stack spacing={0.75}>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">
                                                            {t("morePlan.extend.currentEnd")}
                                                        </Typography>
                                                        <Typography variant="body2">{extendPreview.from}</Typography>
                                                    </Stack>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">
                                                            {t("morePlan.extend.newEnd")}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                            {extendPreview.to}
                                                        </Typography>
                                                    </Stack>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">
                                                            {t("morePlan.extend.amount")}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                            {formatVND(extendPreview.amount)} VND
                                                        </Typography>
                                                    </Stack>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {t("morePlan.extend.amountNote")}
                                                    </Typography>
                                                </Stack>
                                            ) : (
                                                <Typography variant="caption" color="error">
                                                    {extendTarget
                                                        ? t("morePlan.extend.daysInvalid")
                                                        : t("morePlan.errors.pickTarget")}
                                                </Typography>
                                            )}

                                            <Divider />
                                            <Button
                                                variant="contained"
                                                size="large"
                                                onClick={handleExtend}
                                                disabled={extending || !extendPreview}
                                                sx={{ alignSelf: "flex-start" }}
                                            >
                                                {extending ? t("morePlan.extend.submitting") : t("morePlan.extend.submit")}
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            )}

                            {tab === 2 && (
                                <Stack spacing={2}>
                                    {plainPlans.length === 0 ? (
                                        <Alert severity="info">{t("morePlan.convert.noPlan")}</Alert>
                                    ) : (
                                        <>
                                            <Typography variant="body2" color="text.secondary">
                                                {t("morePlan.convert.hint")}
                                            </Typography>

                                            <TextField
                                                select
                                                size="small"
                                                label={t("morePlan.convert.source")}
                                                value={convertSource}
                                                onChange={(event) => setConvertSource(event.target.value)}
                                            >
                                                {plainPlans.map((plan) => (
                                                    <MenuItem key={plan.planUserCode} value={plan.planUserCode}>
                                                        {`${formatVND(plan.fee)} VND · ${plan.planDay} ${t("payment.unit.day")} · ${plan.envQuota} ${t("payment.unit.link")}`}
                                                    </MenuItem>
                                                ))}
                                            </TextField>

                                            {convertLoading && (
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <CircularProgress size={18} />
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t("common.loading")}
                                                    </Typography>
                                                </Stack>
                                            )}

                                            {convertError && <Alert severity="error">{convertError}</Alert>}

                                            {!convertLoading && chosenConvertSource && convertTargets.length === 0 && !convertError && (
                                                <Alert severity="info">{t("morePlan.convert.noTarget")}</Alert>
                                            )}

                                            {chosenConvertSource && convertTargets.length > 0 && (
                                                <>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Chip
                                                            size="small"
                                                            color={groupColor(convertSourceGroup)}
                                                            onClick={() => { }}
                                                            clickable={false}
                                                            label={t(`plans.group.${convertSourceGroup}.label`)}
                                                        />
                                                        <Typography variant="body2" color="text.secondary">
                                                            {t("morePlan.convert.targetsNote")}
                                                        </Typography>
                                                    </Stack>
                                                    <Grid container spacing={1.5}>
                                                        {convertTargets.map((plan) => {
                                                            const isSelected = convertTarget === plan.planCode;
                                                            const color = groupColor(plan.planGroup || convertSourceGroup);
                                                            return (
                                                                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.planCode}>
                                                                    <Card
                                                                        variant="outlined"
                                                                        sx={{
                                                                            height: "100%",
                                                                            borderColor: isSelected ? `${color}.main` : "divider",
                                                                            borderWidth: isSelected ? 2 : 1,
                                                                        }}
                                                                    >
                                                                        <CardActionArea
                                                                            onClick={() => setConvertTarget(plan.planCode)}
                                                                            sx={{ height: "100%" }}
                                                                        >
                                                                            <Stack spacing={1} sx={{ p: 2 }}>
                                                                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                                                    {formatVND(plan.fee)} VND
                                                                                </Typography>
                                                                                <Typography variant="body2" color="text.secondary">
                                                                                    {plan.planDay} {t("payment.unit.day")} · {plan.envCount} {t("payment.unit.link")}
                                                                                </Typography>
                                                                                {isSelected && (
                                                                                    <Chip
                                                                                        size="small"
                                                                                        color={color}
                                                                                        onClick={() => { }}
                                                                                        clickable={false}
                                                                                        label={t("morePlan.selected")}
                                                                                        sx={{ alignSelf: "flex-start" }}
                                                                                    />
                                                                                )}
                                                                            </Stack>
                                                                        </CardActionArea>
                                                                    </Card>
                                                                </Grid>
                                                            );
                                                        })}
                                                    </Grid>
                                                </>
                                            )}

                                            {convertDelta !== null && (
                                                <>
                                                    {convertDelta > 0 ? (
                                                        <Alert severity="info">
                                                            <Typography variant="body2">
                                                                {t("morePlan.convert.payMore", {
                                                                    amount: formatVND(convertDelta),
                                                                })}
                                                            </Typography>
                                                        </Alert>
                                                    ) : (
                                                        // Zero or negative: the plan still changes and the
                                                        // surplus is gone. Said in the warning itself, because
                                                        // agreeing without reading it would cost real money.
                                                        <Alert severity="warning">
                                                            <Stack spacing={0.5}>
                                                                <Typography variant="body2">
                                                                    {convertDelta === 0
                                                                        ? t("morePlan.convert.samePrice")
                                                                        : t("morePlan.convert.loseMoney", {
                                                                            amount: formatVND(Math.abs(convertDelta)),
                                                                        })}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {t("morePlan.convert.noRefundNote")}
                                                                </Typography>
                                                            </Stack>
                                                        </Alert>
                                                    )}
                                                    <Typography variant="caption" color="text.secondary">
                                                        {t("morePlan.convert.restartNote")}
                                                    </Typography>
                                                </>
                                            )}

                                            <Divider />
                                            <Button
                                                variant={convertDelta !== null && convertDelta <= 0 ? "outlined" : "contained"}
                                                color={convertDelta !== null && convertDelta <= 0 ? "warning" : groupColor(convertSourceGroup)}
                                                size="large"
                                                onClick={handleConvert}
                                                disabled={converting || convertDelta === null}
                                                sx={{ alignSelf: "flex-start" }}
                                            >
                                                {converting
                                                    ? t("morePlan.convert.submitting")
                                                    : convertDelta !== null && convertDelta <= 0
                                                        ? t("morePlan.convert.submitAcceptLoss")
                                                        : t("morePlan.convert.submitPay")}
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </CardWrapper>
                )}
            </Stack>
        </PageContainer>
    );
};

export default MorePlanPage;
