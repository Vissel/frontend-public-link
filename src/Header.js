import React from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import NotificationBell from "./components/NotificationBell";
import { useTranslation } from "react-i18next";

const normalizeRole = (role) => String(role || "").toLowerCase();

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout, username: userName, userRole } = useAuth();
  const { t, i18n } = useTranslation();

  const normalizedRole = normalizeRole(userRole);
  const isAuthenticated = Boolean(auth);
  const homeTarget =
    normalizedRole === "admin"
      ? "/adminHome"
      : normalizedRole === "seller"
        ? "/sellerHome"
        : "/login";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
  };

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        borderBottom: "1px solid",
        borderColor: "divider",
        backdropFilter: "blur(18px)",
        backgroundColor: "rgba(255, 255, 255, 0.9)",
      }}
    >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 72, md: 80 },
            gap: 2,
          }}
        >
          <Stack
            component={RouterLink}
            to={homeTarget}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              flexGrow: 1,
              color: "inherit",
              textDecoration: "none",
              minWidth: 0,
            }}
          >
            <Box
              component="img"
              src="/img/logo-3.png"
              alt="Public link"
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                objectFit: "cover",
                boxShadow: "0 12px 24px rgba(15, 76, 129, 0.18)",
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t("header.publicLink")}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {t("header.tagline")}
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="flex-end"
            flexWrap="wrap"
          >
            <Button
              variant={i18n.language === "en" ? "contained" : "outlined"}
              size="small"
              onClick={() => handleLanguageChange("en")}
              sx={{ minWidth: 40, p: 0.5 }}
            >
              EN
            </Button>
            <Button
              variant={i18n.language === "vi" ? "contained" : "outlined"}
              size="small"
              onClick={() => handleLanguageChange("vi")}
              sx={{ minWidth: 40, p: 0.5 }}
            >
              VI
            </Button>
            {isAuthenticated && location.pathname !== homeTarget && (
              <Button component={RouterLink} to={homeTarget} variant="text">
                {t("header.workspace")}
              </Button>
            )}
            {isAuthenticated && (
              <>
                {normalizedRole === "seller" && <NotificationBell />}
                <Chip
                  color="primary"
                  variant="outlined"
                  label={`${userName || "User"} \u2022 ${userRole || "Member"}`}
                  onClick={() => { }}
                  clickable={false}
                />
              </>
            )}

            {isAuthenticated ? (
              <Button variant="contained" color="primary" onClick={handleLogout}>
                {t("header.logout")}
              </Button>
            ) : (
              <Button
                component={RouterLink}
                to="/login"
                variant={location.pathname === "/login" ? "contained" : "outlined"}
              >
                {t("header.login")}
              </Button>
            )}
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

export default Header;
