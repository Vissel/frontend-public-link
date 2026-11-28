import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Button,
    Card,
    CardActionArea,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    Grid,
    Stack,
    Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";
import OnboardingSteps from "../components/OnboardingSteps";
import PaymentInfoPanel from "../components/PaymentInfoPanel";
import PlanWindowDialog from "../form/PlanWindowDialog";
import { formatVND } from "../util/clipboard";
import {
    PLAN_GROUP_BOOKING,
    PLAN_GROUP_PRODUCT,
    groupColor,
    normalizeGroup,
} from "../util/planGroup";
import { useTranslation } from "react-i18next";

/** How often the screen asks whether the admin has verified the transfer. */
const POLL_INTERVAL_MS = 20000;

/**
 * Where "or go to home" leads. A public page the visitor left to register - a
 * yoga calendar, for instance - hands its own URL over as ?next=, and that is
 * where they go back to; anyone who started on this screen goes to the seller
 * workspace, because /plans itself is seller-only.
 *
 * Read once from the address bar rather than through a router hook: the query
 * cannot change while the screen is mounted, and this keeps the page free of a
 * second routing dependency.
 */
const goHomeTarget = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/plans")) {
        return "/sellerHome";
    }
    return next;
};

const STATE_PICK_PLAN = "PICK_PLAN";
const STATE_WAITING_TRANSFER = "WAITING_TRANSFER";
const STATE_WAITING_CONFIRM = "WAITING_CONFIRM";
const STATE_ACTIVE = "ACTIVE";

/**
 * Self-service plan and payment screen: the seller picks a plan from the
 * catalog, gets the transfer instructions (VietQR plus the receiving accounts)
 * on the same screen, declares the transfer, and watches for the admin to
 * activate the plan.
 *
 * One screen, four states, and the backend always says which one it is - the
 * UI never guesses from payment statuses it cannot see.
 */
const PlanSelectPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [state, setState] = useState(null);
    const [plans, setPlans] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogLoaded, setCatalogLoaded] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    // Bumped by the catalog retry: the fetch below is guarded by state flags, so
    // asking for a retry while the catalog is still empty - and catalogLoaded is
    // already false - would otherwise not retrigger it.
    const [catalogAttempt, setCatalogAttempt] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState("");
    // The plan whose window popup is open, and the window the seller confirmed
    // for the plan they picked. A card click opens the popup rather than
    // selecting straight away, because the start is part of the choice.
    const [windowPlan, setWindowPlan] = useState(null);
    const [appliedWindow, setAppliedWindow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [switchOpen, setSwitchOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    // Busy state of the one-time purpose choice a new seller owes.
    const [choosing, setChoosing] = useState(false);

    const loadState = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError("");
        try {
            const res = await pubApi.get("/api/v1/sellerPlan/current");
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to load the onboarding state", err);
            setError(err?.response?.data?.message || t("plans.errors.load"));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [t]);

    useEffect(() => {
        loadState();
    }, [loadState]);

    const needsCatalog = state === null || state?.state === STATE_PICK_PLAN;

    // The backend owns the answer; a legacy account with no stored purpose reads
    // as PRODUCT, which is exactly the catalog it has always been shown.
    const purpose = normalizeGroup(state?.planPurpose);
    const otherPurpose = purpose === PLAN_GROUP_BOOKING ? PLAN_GROUP_PRODUCT : PLAN_GROUP_BOOKING;
    const purposeColor = groupColor(purpose);
    // The backend owns this answer, because "ever taken" includes grants an admin
    // later rejected, which the visible plan list cannot show.
    const freePlanUsed = Boolean(state?.freePlanUsed);

    useEffect(() => {
        // null: never fetched. Once the catalog is in hand the screen keeps it, so
        // polling an open order does not refetch a list that barely changes.
        // catalogLoading is deliberately NOT a dependency: it is set to true in
        // this very effect, and React would then run the cleanup below and mark
        // the in-flight request cancelled - the spinner would never stop even
        // though the catalog arrived.
        if (!needsCatalog || plans.length > 0 || catalogLoaded) {
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
                    setCatalogError(t("plans.errors.catalog"));
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
        // purpose is a dependency: switching must drop the group just fetched.
    }, [needsCatalog, plans.length, catalogLoaded, catalogAttempt, purpose, t]);

    // The admin activation is invisible until someone asks, so while an order is
    // open the screen keeps asking. A rejected order falls back to the catalog by
    // itself, because the backend only reports an open order while it is payable.
    useEffect(() => {
        const open = state?.state === STATE_WAITING_TRANSFER || state?.state === STATE_WAITING_CONFIRM;
        if (!open) {
            return undefined;
        }
        const timer = setInterval(() => {
            loadState({ quiet: true });
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [state, loadState]);

    const handleBuy = async () => {
        if (!selectedPlan) {
            setError(t("plans.errors.pickFirst"));
            return;
        }
        setError("");
        setBuying(true);
        try {
            // The chosen start travels with the order. Without one the plan
            // starts whenever the admin confirms the money, which is the old
            // behaviour and still the right default.
            const res = await pubApi.post("/api/v1/sellerPlan/select", {
                planCode: selectedPlan,
                ...(appliedWindow?.startAt ? { startAt: appliedWindow.startAt } : {}),
            });
            setSelectedPlan("");
            setAppliedWindow(null);
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to open the plan order", err);
            setError(err?.response?.data?.message || t("plans.errors.buy"));
        } finally {
            setBuying(false);
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

    /**
     * Move the account onto the other plan group. Deliberately a confirmed, named
     * action rather than a filter: buying the wrong kind of plan is the mistake
     * the split exists to prevent, so undoing it has to feel like a decision.
     */
    /**
     * Store the account's purpose and reload the state. Shared by the two ways
     * the screen asks: the one-time choice a new seller owes (no purpose yet)
     * and the confirmed switch an older account makes deliberately.
     */
    const applyPurpose = useCallback(async (chosen) => {
        setError("");
        try {
            const res = await pubApi.post("/api/v1/sellerPlan/purpose", { planPurpose: chosen });
            // Drop the group just shown, or the effect below would keep it cached.
            setPlans([]);
            setCatalogLoaded(false);
            setCatalogAttempt((attempt) => attempt + 1);
            setSelectedPlan("");
            setAppliedWindow(null);
            setState(res.data || null);
        } catch (err) {
            console.error("Failed to set the plan purpose", err);
            setError(err?.response?.data?.message || t("plans.switchPurpose.failed"));
        }
    }, [t]);

    const handleSwitchPurpose = async () => {
        setSwitching(true);
        await applyPurpose(otherPurpose);
        setSwitchOpen(false);
        setSwitching(false);
    };

    /**
     * The question moved here from the register form: a new seller answers it
     * before the catalog shows, and the answer is stored on the account.
     */
    const handleChoosePurpose = async (chosen) => {
        setChoosing(true);
        await applyPurpose(chosen);
        setChoosing(false);
    };

    const activeStep = useMemo(() => {
        if (state?.state === STATE_WAITING_CONFIRM || state?.state === STATE_ACTIVE) {
            return 2;
        }
        return 1;
    }, [state]);

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
    const paymentStatus = pending?.status;

    return (
        <PageContainer maxWidth="md">
            <Stack spacing={3}>
                <CardWrapper>
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                            <Typography variant="h4">{t("plans.title")}</Typography>
                            {refreshing && <CircularProgress size={16} />}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {t("plans.subtitle")}
                        </Typography>
                        <OnboardingSteps activeStep={activeStep} />
                    </Stack>
                </CardWrapper>

                {error && (
                    <Alert
                        severity="error"
                        sx={{ alignItems: "center" }}
                        action={
                            <Button color="inherit" size="small" onClick={() => loadState()}>
                                {t("plans.retry")}
                            </Button>
                        }
                    >
                        {error}
                    </Alert>
                )}

                {!state && !error && (
                    <Alert severity="warning">
                        <Stack spacing={1}>
                            <Typography variant="body2">{t("plans.errors.load")}</Typography>
                            <Button variant="outlined" size="small" onClick={() => loadState()} sx={{ alignSelf: "flex-start" }}>
                                {t("plans.retry")}
                            </Button>
                        </Stack>
                    </Alert>
                )}

                {state?.state === STATE_ACTIVE && (
                    <Alert severity="success">
                        <Stack spacing={1.5}>
                            <Chip
                                size="small"
                                color={groupColor(state.activePlan?.planGroup || purpose)}
                                onClick={() => { }}
                                clickable={false}
                                sx={{ alignSelf: "flex-start" }}
                                label={t(`plans.group.${normalizeGroup(state.activePlan?.planGroup || purpose)}.label`)}
                            />
                            <Typography variant="body2">
                                {t("plans.activeMessage", {
                                    from: state.activePlan?.activeDate || "-",
                                    to: state.activePlan?.endedDate || "-",
                                    links: state.activePlan?.envQuota ?? "-",
                                })}
                            </Typography>
                            <Button variant="contained" onClick={() => navigate("/sellerHome")} sx={{ alignSelf: "flex-start" }}>
                                {t("plans.goWorkspace")}
                            </Button>
                        </Stack>
                    </Alert>
                )}

                {(state?.state === STATE_WAITING_TRANSFER || state?.state === STATE_WAITING_CONFIRM) && !pending && (
                    // The order exists but its transfer details could not be assembled -
                    // most likely the payment link aged out and could not be rebuilt.
                    // Saying so beats showing an empty screen, and it must not invite a
                    // second order for the same plan.
                    <Alert severity="warning">
                        <Stack spacing={1}>
                            <Typography variant="body2">{t("plans.orderWithoutInstructions")}</Typography>
                            <Button variant="outlined" size="small" onClick={() => loadState()} sx={{ alignSelf: "flex-start" }}>
                                {t("plans.retry")}
                            </Button>
                        </Stack>
                    </Alert>
                )}

                {/* Moved here from the register form: a new seller answers the
                    purpose question once, before any catalog is shown. */}
                {state?.state === STATE_PICK_PLAN && state?.purposeChosen === false && (
                    <CardWrapper>
                        <Stack spacing={2}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {t("plans.purpose.title")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("plans.purpose.helper")}
                            </Typography>
                            <Grid container spacing={1.5}>
                                {[PLAN_GROUP_PRODUCT, PLAN_GROUP_BOOKING].map((purpose) => (
                                    <Grid size={{ xs: 12, sm: 6 }} key={purpose}>
                                        <Card
                                            variant="outlined"
                                            sx={{
                                                height: "100%",
                                                borderColor: `${groupColor(purpose)}.main`,
                                                borderWidth: 1,
                                            }}
                                        >
                                            <CardActionArea
                                                disabled={choosing}
                                                onClick={() => handleChoosePurpose(purpose)}
                                                sx={{ height: "100%" }}
                                            >
                                                <Stack spacing={1} sx={{ p: 2 }}>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                                        {t(`plans.purpose.${purpose}.title`)}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t(`plans.purpose.${purpose}.description`)}
                                                    </Typography>
                                                </Stack>
                                            </CardActionArea>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                            {choosing && (
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <CircularProgress size={16} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t("common.loading")}
                                    </Typography>
                                </Stack>
                            )}
                        </Stack>
                    </CardWrapper>
                )}

                {state?.state === STATE_PICK_PLAN && state?.purposeChosen !== false && (
                    <CardWrapper>
                        <Stack spacing={2}>
                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                    {t("plans.catalogTitle")}
                                </Typography>
                                {/* The group is named in words, not only by colour,
                                    so a buyer can tell what they are about to pay for. */}
                                <Chip
                                    size="small"
                                    color={purposeColor}
                                    onClick={() => { }}
                                    clickable={false}
                                    label={t(`plans.group.${purpose}.label`)}
                                />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                {t(`plans.group.${purpose}.hint`)}
                            </Typography>

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
                                            {t("plans.retry")}
                                        </Button>
                                    </Stack>
                                </Alert>
                            )}

                            {!catalogLoading && !catalogError && plans.length === 0 && (
                                <Alert severity="info">{t("plans.catalogEmpty")}</Alert>
                            )}

                            {!catalogLoading && !catalogError && plans.length === 0 && (
                                <Typography variant="caption" color="text.secondary">
                                    {t(`plans.group.${purpose}.emptyNote`)}
                                </Typography>
                            )}

                            <Grid container spacing={2}>
                                {plans.map((plan) => {
                                    const isSelected = selectedPlan === plan.planCode;
                                    const free = Number(plan.fee) === 0;
                                    // The free plan is one per account, ever. Showing it
                                    // as pickable only to reject the click would look like
                                    // a bug, so it is greyed out with the reason instead.
                                    const freeBlocked = free && freePlanUsed;
                                    return (
                                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.planCode}>
                                            <Card
                                                variant="outlined"
                                                sx={{
                                                    height: "100%",
                                                    borderColor: isSelected ? "primary.main" : "divider",
                                                    borderWidth: isSelected ? 2 : 1,
                                                    opacity: freeBlocked ? 0.6 : 1,
                                                }}
                                            >
                                                <CardActionArea
                                                    disabled={freeBlocked}
                                                    onClick={() => setWindowPlan(plan)}
                                                    sx={{ height: "100%" }}
                                                >
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
                                                                    label={t("plans.selected")}
                                                                />
                                                            )}
                                                            {freeBlocked && (
                                                                <Chip
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="warning"
                                                                    onClick={() => { }}
                                                                    clickable={false}
                                                                    label={t("plans.freeUsed")}
                                                                />
                                                            )}
                                                        </Stack>
                                                        <Typography variant="body2" color="text.secondary">
                                                            {plan.planDay} {t("payment.unit.day")} · {plan.envCount} {t("payment.unit.link")}
                                                        </Typography>
                                                        {plan.planGroup && (
                                                            <Typography variant="caption" sx={{ color: `${groupColor(plan.planGroup)}.main`, fontWeight: 600 }}>
                                                                {t(`plans.group.${normalizeGroup(plan.planGroup)}.label`)}
                                                            </Typography>
                                                        )}
                                                        {free && !freeBlocked && (
                                                            <Typography variant="caption" color="success.main">
                                                                {t("plans.freeAutoNote")}
                                                            </Typography>
                                                        )}
                                                        {freeBlocked && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                {t("plans.freeUsedNote")}
                                                            </Typography>
                                                        )}
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

                            <Divider />
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    color={purposeColor}
                                    onClick={handleBuy}
                                    disabled={buying || !selectedPlan || plans.length === 0}
                                >
                                    {buying ? t("plans.buying") : t("plans.continueToPayment")}
                                </Button>
                                {/* Leaving stays possible: a visitor who only came
                                    to book a yoga class or a court must not be
                                    trapped by the plan gate they ran into. */}
                                <Button
                                    variant="outlined"
                                    size="large"
                                    onClick={() => navigate(goHomeTarget())}
                                    disabled={buying}
                                >
                                    {t("plans.orGoHome")}
                                </Button>
                                <Typography variant="caption" color="text.secondary">
                                    {t("plans.transferGuide")}
                                </Typography>
                            </Stack>
                            {/* Only offered while nothing is unpaid: switching groups
                                with an open order would strand a transfer the seller
                                no longer wants, and the backend refuses it too. */}
                            {!state?.pendingPayment && (
                                <Button
                                    size="small"
                                    color={groupColor(otherPurpose)}
                                    onClick={() => setSwitchOpen(true)}
                                    sx={{ alignSelf: "flex-start" }}
                                >
                                    {t("plans.switchPurpose.link", {
                                        group: t(`plans.group.${otherPurpose}.label`),
                                    })}
                                </Button>
                            )}
                        </Stack>
                    </CardWrapper>
                )}

                {(state?.state === STATE_WAITING_TRANSFER || state?.state === STATE_WAITING_CONFIRM) && pending && (
                    <>
                        {state.state === STATE_WAITING_CONFIRM && (
                            <Alert severity="info">
                                <Stack spacing={0.5}>
                                    <Chip size="small" color="info" label={t("payment.status.waiting")} />
                                    <Typography variant="body2">{t("plans.waitingMessage")}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t("plans.pollingNote")}
                                    </Typography>
                                </Stack>
                            </Alert>
                        )}
                        {paymentStatus === "PAID" && (
                            // The admin marked the order paid between two polls; the next one
                            // already reports the plan as active, so this is only the notice.
                            <Alert severity="success">{t("payment.status.paid")}</Alert>
                        )}
                        <PaymentInfoPanel
                            info={pending}
                            token={pending.paymentToken}
                            status={paymentStatus}
                            defaultEmail={state.contactEmail || ""}
                            onConfirmed={handleConfirmed}
                            onError={handleConfirmError}
                        />
                    </>
                )}
            </Stack>

            <PlanWindowDialog
                open={Boolean(windowPlan)}
                plan={windowPlan}
                appliedStartAt={
                    appliedWindow && appliedWindow.planCode === windowPlan?.planCode
                        ? appliedWindow.startAt
                        : ""
                }
                onApplied={(startAt, endAt) => {
                    if (!windowPlan) {
                        return;
                    }
                    setSelectedPlan(windowPlan.planCode);
                    setAppliedWindow({ planCode: windowPlan.planCode, startAt, endAt });
                }}
                onClose={() => setWindowPlan(null)}
            />

            <Dialog open={switchOpen} onClose={() => setSwitchOpen(false)}>
                <DialogTitle>{t("plans.switchPurpose.dialogTitle")}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t("plans.switchPurpose.dialogBody", {
                            current: t(`plans.group.${purpose}.label`),
                            target: t(`plans.group.${otherPurpose}.label`),
                        })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSwitchOpen(false)} disabled={switching}>
                        {t("common.cancel")}
                    </Button>
                    <Button
                        variant="contained"
                        color={groupColor(otherPurpose)}
                        onClick={handleSwitchPurpose}
                        disabled={switching}
                    >
                        {switching ? t("plans.switchPurpose.switching") : t("plans.switchPurpose.confirm")}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default PlanSelectPage;
