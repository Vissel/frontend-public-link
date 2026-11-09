import React from "react";
import { Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import ChatWidget from "./components/ChatWidget";

function Layout({ children }) {
  const location = useLocation();
  // The admin console already shows the same threads, so the visitor widget would
  // only overlap it there.
  const showChatWidget = !location.pathname.startsWith("/adminChat");

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
      {showChatWidget ? <ChatWidget /> : null}
    </Box>
  );
}

export default Layout;
