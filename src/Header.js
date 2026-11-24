import React from "react";
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import NotificationBell from "./components/NotificationBell";
import AccountMenu from "./components/AccountMenu";
import { useTranslation } from "react-i18next";

const normalizeRole = (role) => String(role || "").toLowerCase();

// Everything the plan-purchase side of the app refuses to sell to. Both admin
// authorities are listed because the gateway treats Badminton_Admin as an
// admin too (/publiclink/admin/v1/** allows either).
const ADMIN_ROLES = ["admin", "badminton_admin"];

function Header() {
  const location = useLocation();
  const { auth, userRole } = useAuth();
  const { t, i18n } = useTranslation();

  const normalizedRole = normalizeRole(userRole);
  const isAuthenticated = Boolean(auth);
  const isAdmin = ADMIN_ROLES.includes(normalizedRole);
  // Admins and sellers keep their workspaces. Any other signed-in role (a
  // buyer, for instance) has no workspace to land in: the seller home would
  // bounce it straight back to the login form, so the plan screen - which
  // every non-admin account may open - is the honest destination.
  const homeTarget =
    normalizedRole === "admin"
      ? "/adminHome"
      : normalizedRole === "seller"
        ? "/sellerHome"
        : isAuthenticated
          ? "/morePlan"
          : "/login";

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
            {/* Buying more capacity is open to every account that can own a
                plan, so it sits next to the workspace rather than inside the
                setup page, which sellers only reach as a read-only view. */}
            {isAuthenticated && !isAdmin && (
              <Button
                component={RouterLink}
                to="/morePlan"
                variant={location.pathname === "/morePlan" ? "contained" : "text"}
              >
                {t("header.morePlan")}
              </Button>
            )}
            {isAuthenticated && (normalizedRole === "admin" || normalizedRole === "seller") && (
              <Button
                component={RouterLink}
                to={normalizedRole === "admin" ? "/setup" : "/sellerSetup"}
                variant="text"
              >
                {t("header.setup")}
              </Button>
            )}
            {/* Chat moved into the account menu, unread badge on the avatar. */}
            {/* Every signed-in role gets the bell: the endpoints are
                identity-scoped, not role-scoped, so a buyer now sees the
                "plan activated" news their purchase ends with, and the admin
                keeps the payment confirmations they act on. */}
            {isAuthenticated && <NotificationBell />}
            {isAuthenticated && <AccountMenu />}

            {!isAuthenticated && (
              <Button
                component={RouterLink}
                to="/register"
                variant={location.pathname === "/register" ? "contained" : "outlined"}
              >
                {t("header.register")}
              </Button>
            )}
            {!isAuthenticated && (
              <Button
                component={RouterLink}
                to="/login"
                variant={location.pathname === "/login" ? "contained" : "text"}
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
