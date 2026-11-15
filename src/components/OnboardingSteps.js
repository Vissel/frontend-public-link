import React from "react";
import { Box, Step, StepLabel, Stepper, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

/**
 * The three steps of a self-service sign-up, shown on both the register screen
 * and the plan screen so the seller always knows how far they are from selling.
 *
 * It is a signpost, not a wizard: nothing here blocks or advances, the screens
 * just say which step they are on.
 *
 * @param activeStep 0 account, 1 plan and transfer, 2 activation
 */
const OnboardingSteps = ({ activeStep = 0 }) => {
    const { t } = useTranslation();
    const steps = [
        { label: t("onboarding.steps.account"), hint: t("onboarding.hints.account") },
        { label: t("onboarding.steps.plan"), hint: t("onboarding.hints.plan") },
        { label: t("onboarding.steps.activate"), hint: t("onboarding.hints.activate") },
    ];

    return (
        <Box sx={{ width: "100%" }}>
            <Stepper activeStep={activeStep} alternativeLabel>
                {steps.map((step) => (
                    <Step key={step.label}>
                        <StepLabel>{step.label}</StepLabel>
                    </Step>
                ))}
            </Stepper>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: "center" }}>
                {steps[activeStep]?.hint}
            </Typography>
        </Box>
    );
};

export default OnboardingSteps;
