import { useEffect, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const SellerHome = () => {
  const [username, setUsername] = useState("");
  const { state } = useLocation();

  useEffect(() => {
    setUsername(state?.username || "");
  }, [state]);

  return (
    <PageContainer maxWidth="md">
      <SectionBlock
        title="Seller Home"
        description="This seller-facing landing page now uses the same MUI spacing, typography, and responsive container system as the rest of the app."
      >
        <Stack spacing={1}>
          <Typography variant="h5">
            Welcome to the home page{username ? `, ${username}` : ""}.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Use the public link provided to manage customer orders from mobile or desktop.
          </Typography>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default SellerHome;
