import React from "react";
import { Box } from "@mui/material";
import Header from "./Header";
import Footer from "./Footer";

function Layout({ children }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header />
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
        }}
      >
        {children}
      </Box>
      <Footer />
    </Box>
  );
}

export default Layout;
