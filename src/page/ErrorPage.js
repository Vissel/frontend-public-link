import { Alert, Stack, Typography } from "@mui/material";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const ErrorPage = () => {
  return (
    <PageContainer maxWidth="sm">
      <SectionBlock title="Error Page" description="Something went wrong while loading this page.">
        <Stack spacing={2}>
          <Alert severity="error">
            The requested page could not be loaded. Please retry from the previous page or sign in again.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            This fallback view has been migrated to the same MUI-only shell as the main application.
          </Typography>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default ErrorPage;
