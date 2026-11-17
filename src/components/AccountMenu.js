import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Avatar,
  Badge,
  Divider,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  SvgIcon,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../api";
import { useAuth } from "../AuthContext";
import { colorFromString, initialsOf } from "../util/avatar";
import { getUnreadTotal, subscribeUnread } from "../util/chatUnread";
import AvatarDialog from "./AvatarDialog";

// Hover opens after a short dwell (so a pass across the header never pops the
// menu) and closes only after a grace period, which is what lets the pointer
// travel from the button into the menu without it disappearing.
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 300;

const CHAT_ROUTE = "/adminChat";

const cacheKey = (username) => `avatar:${username || "anonymous"}`;

const ChatSvgIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H5.17L4 15.17V4h16v10z" />
  </SvgIcon>
);

const badgeSx = {
  "& .MuiBadge-badge": { fontSize: 10, height: 16, minWidth: 16 },
};

// The avatar badge sits on top of a picture, so it needs a ring to stay legible.
const avatarBadgeSx = {
  "& .MuiBadge-badge": {
    ...badgeSx["& .MuiBadge-badge"],
    border: "2px solid",
    borderColor: "background.paper",
  },
};

/**
 * Account control that replaces the old username chip plus Logout button:
 * an avatar (upload-able) whose menu carries the identity, the admin chat
 * console and the logout action.
 */
const AccountMenu = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { auth, logout, username, userRole } = useAuth();
  const isAdmin = String(userRole || "").toLowerCase() === "admin";
  // Written by ChatNotifier, which owns the live stream. Read here so the unread
  // total stays visible now that the Chat entry lives inside this menu.
  const unreadChat = useSyncExternalStore(subscribeUnread, getUnreadTotal, getUnreadTotal);

  const buttonRef = useRef(null);
  const menuPaperRef = useRef(null);
  const openTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  // Mirrors `open` for the timer callbacks: a callback must not read a stale
  // closure value, or it re-opens a menu that is already up.
  const openRef = useRef(false);
  const [anchorEl, setAnchorEl] = useState(null);
  // A menu opened by click stays until the user clicks away or picks an item;
  // only a hover-opened menu follows the pointer out. It also says whether the
  // menu may take focus: a hover-opened one must not, or it pulls the caret out
  // of whatever the user was typing in.
  const [openedByClick, setOpenedByClick] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const open = Boolean(anchorEl);

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = 0;
    closeTimerRef.current = 0;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    openRef.current = Boolean(anchorEl);
  }, [anchorEl]);

  // Cached value is painted immediately, then revalidated against the server:
  // the avatar changes rarely, so a stale picture for a moment is acceptable
  // while a spinner is not.
  useEffect(() => {
    if (!auth) {
      setDataUrl("");
      return undefined;
    }
    const cached = window.localStorage.getItem(cacheKey(username));
    if (cached) setDataUrl(cached);
    let cancelled = false;
    api.get("/api/v1/user/avatar")
      .then((response) => {
        if (cancelled) return;
        const next = response.data?.data?.dataUrl || "";
        setDataUrl(next);
        if (next) {
          window.localStorage.setItem(cacheKey(username), next);
        } else {
          window.localStorage.removeItem(cacheKey(username));
        }
      })
      .catch(() => {
        /* cosmetic only - the initials fallback is fine */
      });
    return () => {
      cancelled = true;
    };
  }, [auth, username]);

  const closeMenu = useCallback(() => {
    clearTimers();
    setOpenedByClick(false);
    setAnchorEl(null);
  }, [clearTimers]);

  const openMenu = useCallback((node, byClick) => {
    clearTimers();
    setOpenedByClick(Boolean(byClick));
    setAnchorEl(node);
  }, [clearTimers]);

  /**
   * Grace close, shared by the button and the menu paper: the pointer has to be
   * able to travel between the two without the menu vanishing under it.
   */
  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(closeMenu, HOVER_CLOSE_MS);
  }, [closeMenu]);

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = 0;
  }, []);

  // The Menu paints two full-screen layers over the page: its invisible
  // backdrop and the modal root, a fixed div covering the viewport. Either one
  // takes the pointer away from the button the moment the menu opens - leave,
  // close, enter, open, forever - which is the flicker that made the items
  // unreachable. `ModalProps` is not a Menu prop, so the hideBackdrop inside it
  // never reached the Modal; the props on the Menu below do, and the modal layer
  // is additionally made click-through so the button keeps seeing the pointer.
  // The guards here make the remaining transitions idempotent.
  const handleMouseEnter = useCallback(() => {
    cancelClose();
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = 0;
    if (openRef.current) {
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      if (!openRef.current) {
        openMenu(buttonRef.current, false);
      }
    }, HOVER_OPEN_MS);
  }, [cancelClose, openMenu]);

  const handleMouseLeave = useCallback(() => {
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = 0;
    if (openedByClick) {
      return;
    }
    scheduleClose();
  }, [openedByClick, scheduleClose]);

  const handleClick = useCallback(() => {
    if (openRef.current) {
      closeMenu();
      return;
    }
    openMenu(buttonRef.current, true);
  }, [closeMenu, openMenu]);

  // A click-through modal layer cannot catch a click outside the menu, so the
  // closings the backdrop used to do are done here. mousedown rather than
  // click: closing on click would unmount an item before its own handler ran.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const isPartOfMenu = (target) =>
      Boolean(buttonRef.current?.contains(target)) ||
      Boolean(menuPaperRef.current?.contains(target));
    const handleDocumentMouseDown = (event) => {
      // The button toggles on click and the items close the menu themselves.
      if (isPartOfMenu(event.target)) {
        return;
      }
      closeMenu();
    };
    const handleDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [open, closeMenu]);

  const handleLogout = () => {
    closeMenu();
    logout();
    navigate("/login");
  };

  const handleOpenChat = () => {
    closeMenu();
    navigate(CHAT_ROUTE);
  };

  const handleAvatarChanged = (nextDataUrl) => {
    const value = nextDataUrl || "";
    setDataUrl(value);
    if (value) {
      window.localStorage.setItem(cacheKey(username), value);
    } else {
      window.localStorage.removeItem(cacheKey(username));
    }
  };

  return (
    <>
      <Tooltip
        // Empty title while the menu is up: the tooltip would otherwise sit in
        // the same spot as the menu and linger after it opens.
        title={open ? "" : `${username || t("header.account")} \u2022 ${userRole || ""}`}
        disableHoverListener={open}
      >
        <IconButton
          ref={buttonRef}
          size="small"
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          sx={{ p: 0.25 }}
          aria-label={t("header.account")}
        >
          <Badge
            // The Chat entry lives in this menu now, so the unread total its
            // header button used to carry is announced on the avatar itself.
            badgeContent={isAdmin ? unreadChat : 0}
            color="error"
            max={99}
            sx={avatarBadgeSx}
          >
            <Avatar
              src={dataUrl || undefined}
              alt={username}
              sx={{
                width: 38,
                height: 38,
                fontSize: 15,
                bgcolor: colorFromString(username),
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              {initialsOf(username)}
            </Avatar>
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        // Real Menu props this time - `ModalProps` is not one, so the settings
        // that used to sit inside it never reached the Modal. hideBackdrop drops
        // the invisible full-screen layer that stole the pointer from the
        // button; the click-through modal root below drops the other one.
        // Click-away and Escape are handled by the document listeners above.
        // autoFocus/disableAutoFocus follow openedByClick: a hover-opened menu
        // must not grab focus while the user types somewhere else, a clicked
        // one should, so the arrow keys reach the items.
        hideBackdrop
        disableScrollLock
        disableEnforceFocus
        disableAutoFocus={!openedByClick}
        autoFocus={openedByClick}
        disableAutoFocusItem
        slotProps={{
          root: {
            // The modal root is a fixed div covering the whole viewport: left
            // alone it swallows the pointer events of the button under it.
            sx: { pointerEvents: "none" },
          },
          paper: {
            ref: menuPaperRef,
            // Back in for the menu itself, or the items would not be clickable.
            onMouseEnter: cancelClose,
            onMouseLeave: handleMouseLeave,
            sx: { pointerEvents: "auto", minWidth: 230 },
          },
        }}
      >
        <MenuItem disabled>
          <ListItemText
            primary={username || t("header.account")}
            secondary={userRole || ""}
            slotProps={{
              primary: { sx: { fontWeight: 600, fontSize: "0.9rem" } },
              secondary: { sx: { fontSize: "0.75rem" } },
            }}
          />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu();
            setDialogOpen(true);
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={dataUrl || undefined}
              sx={{ width: 24, height: 24, fontSize: 12, bgcolor: colorFromString(username) }}
            >
              {initialsOf(username)}
            </Avatar>
            <Typography variant="body2">{t("header.changeAvatar")}</Typography>
          </Stack>
        </MenuItem>
        {isAdmin && (
          <MenuItem onClick={handleOpenChat}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Badge badgeContent={unreadChat} color="error" max={99} sx={badgeSx}>
                <ChatSvgIcon sx={{ width: 24, height: 24, color: "text.secondary" }} />
              </Badge>
              <Typography variant="body2">{t("header.chat")}</Typography>
            </Stack>
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleLogout}>
          <Typography variant="body2" color="error.main">
            {t("header.logout")}
          </Typography>
        </MenuItem>
      </Menu>

      <AvatarDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        username={username}
        dataUrl={dataUrl}
        onChanged={handleAvatarChanged}
      />
    </>
  );
};

export default AccountMenu;
