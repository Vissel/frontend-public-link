import { Box, Container, Typography, Link, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";

function Footer() {
  const { t } = useTranslation();
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.5, sm: 1 }}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          sx={{ py: 1 }}
        >
          <Typography variant="caption" component="p" sx={{ m: 0, lineHeight: 1.2 }}>
            © {new Date().getFullYear()} Jade · {t("footer.licensed")}{" "}
            <Link
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              underline="hover"
              sx={{ opacity: 0.9 }}
            >
              MIT License
            </Link>
          </Typography>
          {/* A plain mailto: opens the visitor's mail app directly - no
              target=_blank (new-tab mail links are dead ends in most browsers)
              and a tooltip that says what clicking does. */}
          <Typography variant="caption" component="p" sx={{ m: 0, lineHeight: 1.2 }}>
            {t("footer.contact")}:{" "}
            <Link
              href="mailto:nguyenjade916@gmail.com"
              underline="hover"
              color="primary.main"
              fontWeight={500}
              title={t("footer.contactTitle")}
            >
              nguyenjade916@gmail.com
            </Link>
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}

export default Footer;
