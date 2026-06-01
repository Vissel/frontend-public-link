import { Box, Container, Typography, Link } from "@mui/material";

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
        <Typography variant="caption" component="p" sx={{ m: 0, lineHeight: 1.2 }}>
          © {new Date().getFullYear()} Jade · Licensed under the{" "}
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
      </Container>
    </Box>
  );
}

export default Footer;
