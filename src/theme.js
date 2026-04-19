import { alpha, createTheme } from "@mui/material/styles";

const theme = createTheme({
  spacing: 8,
  shape: {
    borderRadius: 16,
  },
  palette: {
    primary: {
      main: "#0f4c81",
      light: "#4e7aa6",
      dark: "#0b3558",
    },
    secondary: {
      main: "#ef6c36",
      light: "#f39167",
      dark: "#bb4e20",
    },
    success: {
      main: "#2e7d32",
    },
    warning: {
      main: "#c77700",
    },
    background: {
      default: "#f4f7fb",
      paper: "#ffffff",
    },
    text: {
      primary: "#17324d",
      secondary: "#5b6b7f",
    },
  },
  typography: {
    fontFamily: '"Public Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "clamp(2rem, 3vw, 2.75rem)",
      fontWeight: 700,
      lineHeight: 1.15,
    },
    h2: {
      fontSize: "clamp(1.75rem, 2.5vw, 2.25rem)",
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h3: {
      fontSize: "clamp(1.5rem, 2vw, 1.875rem)",
      fontWeight: 700,
      lineHeight: 1.25,
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 700,
    },
    h5: {
      fontSize: "1.1rem",
      fontWeight: 700,
    },
    subtitle1: {
      fontWeight: 600,
    },
    button: {
      fontWeight: 600,
      textTransform: "none",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          minHeight: "100dvh",
        },
        body: {
          minHeight: "100dvh",
          background:
            "linear-gradient(180deg, #eef4fb 0%, #f7f9fc 38%, #f4f7fb 100%)",
        },
        "#root": {
          minHeight: "100dvh",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 20,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: alpha("#0f4c81", 0.08),
          fontWeight: 700,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        fullWidth: true,
        variant: "outlined",
      },
    },
  },
});

export default theme;
