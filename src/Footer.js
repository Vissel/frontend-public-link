import { Box, Container, Typography } from "@mui/material";

function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        borderTop: "1px solid",
        borderColor: "divider",
        backgroundColor: "rgba(255, 255, 255, 0.84)",
      }}
    >
      <Container maxWidth="lg">
        <Typography
          variant="body2"
          color="text.secondary"
          align="center"
          sx={{ py: 2.5 }}
        >
          © Developed by Nguyen Ngoc Thach
        </Typography>
      </Container>
    </Box>
  );
}

export default Footer;
