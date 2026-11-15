import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Button,
    Card,
    CardActionArea,
    Chip,
    CircularProgress,
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
import { formatVND } from "../util/clipboard";
import { useTranslation } from "react-i18next";

/** How often the screen asks whether the admin has verified the transfer. */
const POLL_INTERVAL_MS = 20000;

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
    const [selectedPlan, setSelectedPlan] = useState("");
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

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

    useEffect(() => {
        // null: never fetched. Once the catalog is in hand the screen keeps it, so
        // polling an open order does not refetch a list that barely changes.
        if (!needsCatalog || plans.length > 0 || catalogLoading || catalogLoaded) {
            return undefined;
        }
        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError("");
        pubApi
            .get("/api/v1/publish/plans")
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
    }, [needsCatalog, plans.length, catalogLoading, catalogLoaded, t]);

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
            const res = await pubApi.post("/api/v1/sellerPlan/select", { planCode: selectedPlan });
            setSelectedPlan("");
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

                {state?.state === STATE_PICK_PLAN && (
                    <CardWrapper>
                        <Stack spacing={2}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {t("plans.catalogTitle")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("plans.catalogHint")}
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
                                        <Button size="small" variant="outlined" onClick={() => setCatalogLoaded(false)}>
                                            {t("plans.retry")}
                                        </Button>
                                    </Stack>
                                </Alert>
                            )}

                            {!catalogLoading && !catalogError && plans.length === 0 && (
                                <Alert severity="info">{t("plans.catalogEmpty")}</Alert>
                            )}

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
                                                                <Chip size="small" color="primary" label={t("plans.selected")} />
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

                            <Divider />
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    onClick={handleBuy}
                                    disabled={buying || !selectedPlan || plans.length === 0}
                                >
                                    {buying ? t("plans.buying") : t("plans.continueToPayment")}
                                </Button>
                                <Typography variant="caption" color="text.secondary">
                                    {t("plans.transferGuide")}
                                </Typography>
                            </Stack>
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
        </PageContainer>
    );
};

export default PlanSelectPage;
