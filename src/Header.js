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

const normalizeRole = (role) => String(role || "").toLowerCase();

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout, username: userName, userRole } = useAuth();

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
                Public Link
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                Unified seller registration and order management
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="flex-end"
            flexWrap="wrap"
          >{isAuthenticated && location.pathname !== homeTarget && (
            <Button component={RouterLink} to={homeTarget} variant="text">
              Workspace
            </Button>
          )}
            {isAuthenticated && (
              <Chip
                color="primary"
                variant="outlined"
                label={`${userName || "User"} • ${userRole || "Member"}`}
                onClick={() => { }}
                clickable={false}
              />
            )}

            {isAuthenticated ? (
              <Button variant="contained" color="primary" onClick={handleLogout}>
                Logout
              </Button>
            ) : (
              <Button
                component={RouterLink}
                to="/login"
                variant={location.pathname === "/login" ? "contained" : "outlined"}
              >
                Login
              </Button>
            )}
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

export default Header;
