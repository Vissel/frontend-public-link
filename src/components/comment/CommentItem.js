import React, { useState } from "react";
import {
  Box,
  Button,
  Link,
  Stack,
  SvgIcon,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import CommentAvatar from "./CommentAvatar";
import CommentComposer from "./CommentComposer";
import { commentFileUrl } from "../../api/commentApi";
import { formatCommentDateTime } from "../../util/commentFormat";
import { formatChatBytes } from "../../util/useChatAttachmentDraft";

const FileSvgIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
  </SvgIcon>
);

// Replies deeper than this are rendered at the same indent, so a long chain
// cannot run off the screen; the true parent is still named via "replying to".
const MAX_VISUAL_DEPTH = 3;

const CommentAttachments = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 1 }}>
      {attachments.map((attachment) =>
        attachment.kind === "IMAGE" ? (
          <Box
            key={attachment.uuid}
            component="img"
            src={commentFileUrl(attachment.downloadUrl)}
            alt={attachment.fileName}
            title={attachment.fileName}
            onClick={() =>
              window.open(commentFileUrl(attachment.downloadUrl), "_blank", "noopener,noreferrer")
            }
            sx={{
              width: 96,
              height: 96,
              objectFit: "cover",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              cursor: "pointer",
            }}
          />
        ) : (
          <Link
            key={attachment.uuid}
            href={commentFileUrl(attachment.downloadUrl)}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              fontSize: "0.8rem",
            }}
          >
            <FileSvgIcon fontSize="small" />
            <Box component="span" sx={{ wordBreak: "break-all" }}>
              {attachment.fileName}
              {attachment.sizeBytes ? ` · ${formatChatBytes(attachment.sizeBytes)}` : ""}
            </Box>
          </Link>
        )
      )}
    </Stack>
  );
};

/**
 * One comment and its replies (rendered recursively). Identity rules from the
 * requirement: the author icon (hover reveals the full name) and the post
 * datetime are always shown; the display name is also printed next to the icon.
 *
 * A deleted node renders only a placeholder so its children stay reachable —
 * this is why deletes are soft on the server.
 */
const CommentItem = ({
  comment,
  childrenNodes = [],
  depth = 0,
  isRoot = false,
  replyCount = 0,
  repliesLoaded = true,
  loadingReplies = false,
  onLoadReplies,
  canPost = false,
  currentUser = "",
  onReply,
  onEdit,
  onDelete,
  workingUuid = "",
}) => {
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const isAuthor = Boolean(currentUser) && currentUser === comment.authorUsername;
  const working = workingUuid === comment.uuid;

  const handleReplySubmit = (payload) => {
    onReply(comment, payload);
    setReplying(false);
  };

  return (
    <Box
      sx={{
        pl: Math.min(depth, MAX_VISUAL_DEPTH) > 0 ? 3 : 0,
        borderLeft: depth > 0 ? "2px solid" : "none",
        borderColor: "divider",
        py: 1.25,
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
        <CommentAvatar
          username={comment.authorUsername}
          displayName={comment.authorDisplayName}
          avatarUrl={comment.avatarUrl}
          size={depth > 0 ? 34 : 40}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {comment.authorDisplayName || comment.authorUsername}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatCommentDateTime(comment.createdAt)}
            </Typography>
            {comment.editedAt ? (
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ({t("comment.edited")})
              </Typography>
            ) : null}
          </Stack>

          {comment.replyToName ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {t("comment.replyingTo", { name: comment.replyToName })}
            </Typography>
          ) : null}

          {comment.deleted ? (
            <Typography variant="body2" color="text.disabled" fontStyle="italic" sx={{ mt: 0.25 }}>
              {t("comment.deletedPlaceholder")}
            </Typography>
          ) : editing ? (
            <Box sx={{ mt: 0.75 }}>
              <CommentComposer
                isReply
                initialValue={comment.content}
                working={working}
                submitLabelKey="comment.save"
                onSubmit={({ content }) => {
                  onEdit(comment, content);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </Box>
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.25 }}>
              {comment.content}
            </Typography>
          )}

          {!comment.deleted ? <CommentAttachments attachments={comment.attachments} /> : null}

          {!comment.deleted ? (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5, minHeight: 28 }}>
              {canPost ? (
                <Button size="small" onClick={() => setReplying((v) => !v)} sx={{ fontWeight: 600 }}>
                  {t("comment.reply")}
                </Button>
              ) : null}
              {isAuthor ? (
                <Button size="small" onClick={() => setEditing((v) => !v)}>
                  {t("comment.edit")}
                </Button>
              ) : null}
              {isAuthor ? (
                <Button size="small" color="error" onClick={() => onDelete(comment)}>
                  {t("comment.delete")}
                </Button>
              ) : null}
            </Stack>
          ) : null}

          {replying ? (
            <Box sx={{ mt: 1 }}>
              <CommentComposer
                isReply
                working={working}
                submitLabelKey="comment.replySubmit"
                onSubmit={handleReplySubmit}
                onCancel={() => setReplying(false)}
              />
            </Box>
          ) : null}
        </Box>
      </Stack>

      {/* Replies (rendered as a nested tree, regardless of the composer state). */}
      <Box>
        {childrenNodes.map((node) => (
          <CommentItem
            key={node.comment.uuid}
            comment={node.comment}
            childrenNodes={node.children}
            depth={depth + 1}
            canPost={canPost}
            currentUser={currentUser}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            workingUuid={workingUuid}
          />
        ))}
      </Box>

      {isRoot && !repliesLoaded && replyCount > childrenNodes.length ? (
        <Button
          size="small"
          onClick={() => onLoadReplies && onLoadReplies(comment)}
          disabled={loadingReplies}
          sx={{ ml: 6, fontWeight: 600 }}
        >
          {loadingReplies
            ? t("comment.loading")
            : t("comment.showReplies", { count: replyCount })}
        </Button>
      ) : null}
    </Box>
  );
};

export default CommentItem;
