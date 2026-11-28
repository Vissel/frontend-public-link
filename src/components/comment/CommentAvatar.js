import React, { useState } from "react";
import { Avatar, Tooltip } from "@mui/material";
import { colorFromString, initialsOf } from "../../util/avatar";
import { commentFileUrl } from "../../api/commentApi";

/**
 * The account icon of a comment author, with the full name on hover — the two
 * identity rules of the requirement ("display account icon, hover will see
 * fullname").
 *
 * The picture is the author's avatar served publicly by the comment service
 * (cached from the user service at write time). When there is no picture, or it
 * fails to load, we fall back to deterministic initials + colour, so a comment
 * is never rendered without an icon. The tooltip always carries the display
 * name (falling back to the username), which is what a hover must reveal.
 */
const CommentAvatar = ({ username, displayName, avatarUrl, size = 40 }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const src = avatarUrl ? commentFileUrl(avatarUrl) : "";
  const showImage = Boolean(src) && !imageFailed;
  const tooltip = displayName || username || "";

  return (
    <Tooltip title={tooltip}>
      {/* span so the Tooltip always has a DOM node to anchor to, even when the
          avatar itself has no click handler */}
      <span>
        {showImage ? (
          <Avatar
            src={src}
            alt={tooltip}
            onError={() => setImageFailed(true)}
            sx={{ width: size, height: size, fontSize: size * 0.4 }}
          />
        ) : (
          <Avatar
            sx={{
              width: size,
              height: size,
              fontSize: size * 0.4,
              bgcolor: colorFromString(username || tooltip),
            }}
          >
            {initialsOf(displayName || username)}
          </Avatar>
        )}
      </span>
    </Tooltip>
  );
};

export default CommentAvatar;
