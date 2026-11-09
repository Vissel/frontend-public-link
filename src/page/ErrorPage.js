import { Alert, Stack, Typography } from "@mui/material";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import { useTranslation } from "react-i18next";

const ErrorPage = () => {
  const { t } = useTranslation();
  return (
    <PageContainer maxWidth="sm">
      <SectionBlock title={t("error.title")} description={t("error.description")}>
        <Stack spacing={2}>
          <Alert severity="error">
            {t("error.message")}
          </Alert>
          <Typography variant="body2" color="text.secondary">
            {t("error.fallback")}
          </Typography>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default ErrorPage;
