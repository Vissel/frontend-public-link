import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import TransferInfoManager from "../components/TransferInfoManager";
import YogaPlansManager from "../components/YogaPlansManager";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

/**
 * Seller setup page: read-only view of the plans assigned to the seller plus
 * their own transfer accounts (same component the admin page uses).
 */
const SellerSetupPage = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const res = await pubApi.get(`${contextPath}/api/v1/sellerPlan/myPlans`);
        setPlans(res.data?.items || []);
      } catch (err) {
        console.error("Failed to load own payment plans", err);
        setError(t("sellerSetup.errors.load"));
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, [t]);

  return (
    <PageContainer maxWidth="md">
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3" gutterBottom>
            {t("sellerSetup.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("sellerSetup.subtitle")}
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <SectionBlock title={t("sellerSetup.plansTitle")} description={t("sellerSetup.plansDesc")}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <TableCell align="right">{t("setup.column.fee")}</TableCell>
                  <TableCell align="center">{t("setup.column.days")}</TableCell>
                  <TableCell align="center">{t("setup.column.quota")}</TableCell>
                  <TableCell>{t("setup.column.state")}</TableCell>
                  <TableCell>{t("setup.column.activeDate")}</TableCell>
                  <TableCell>{t("setup.column.endedDate")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        {loading ? t("common.loading") : t("sellerSetup.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {plans.map((plan) => (
                  <TableRow key={plan.planUserCode} hover>
                    <TableCell align="right">{formatVND(plan.fee)}</TableCell>
                    <TableCell align="center">{plan.planDay}</TableCell>
                    <TableCell align="center">
                      {plan.usedCount}/{plan.envQuota}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={plan.remaining > 0 ? "success" : "default"}
                        label={`${t("sellerSetup.remaining")} ${plan.remaining}`}
                      />
                    </TableCell>
                    <TableCell>{plan.activeDate || "-"}</TableCell>
                    <TableCell>{plan.endedDate || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionBlock>

        <SectionBlock
          title={t("sellerSetup.yogaPlansTitle")}
          description={t("sellerSetup.yogaPlansDesc")}
        >
          <YogaPlansManager />
        </SectionBlock>

        <SectionBlock
          title={t("sellerSetup.transferTitle")}
          description={t("sellerSetup.transferDesc")}
        >
          <TransferInfoManager />
        </SectionBlock>
      </Stack>
    </PageContainer>
  );
};

export default SellerSetupPage;
