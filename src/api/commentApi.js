import { commentApi } from "./index";
import config from "./config";

/**
 * Comment service API.
 *
 * All calls go to the comment-app service through the gateway's /comment
 * namespace (see COMMENT_CONTEXT_PATH in api/index.js). Reads live under
 * /api/v1/public/** and are permit-all at the gateway, so an anonymous buyer on
 * a sale link can see the discussion. Writes live under /api/v1/comments/** and
 * carry the JWT + X-User-ID the axios interceptor attaches; the author is
 * derived server-side ONLY from that header, never from the body.
 */

/** One page of root comments for a target. cursor is the previous nextCursor. */
export const fetchComments = ({ targetType, targetId, cursor, limit = 20 }) =>
  commentApi.get("/api/v1/public/comments", {
    params: { targetType, targetId, cursor: cursor || undefined, limit },
  });

/** A thread's replies, chronological. afterId is the last reply id already shown. */
export const fetchReplies = (uuid, { afterId, limit = 50 } = {}) =>
  commentApi.get(`/api/v1/public/comments/${uuid}/replies`, {
    params: { afterId: afterId || undefined, limit },
  });

/**
 * Cached author avatar (base64 data URL) for the comment icon. A 404 simply
 * means "no picture" and the caller falls back to initials.
 */
export const fetchAuthorAvatar = (username) =>
  commentApi.get(`/api/v1/public/avatar/${encodeURIComponent(username)}`);

/**
 * Posts a comment or reply with 0..N attachments. The body is a FormData
 * (content + targetType + targetId + optional parentUuid + files); the axios
 * interceptor drops its JSON Content-Type for FormData so the browser writes
 * the multipart boundary.
 */
export const postComment = (formData) => commentApi.post("/api/v1/comments", formData);

/** Author-only content edit. */
export const editComment = (uuid, content) => commentApi.put(`/api/v1/comments/${uuid}`, { content });

/** Author-only soft delete. */
export const deleteComment = (uuid) => commentApi.delete(`/api/v1/comments/${uuid}`);

/**
 * Attachment bytes for inline thumbnails. Fetched through axios rather than a
 * plain <img src> so the request carries the ngrok-skip header consistently and
 * the object URL can be revoked; the download itself is public by uuid.
 */
export const fetchCommentAttachment = (uuid) =>
  commentApi.get(`/api/v1/public/attachment/${uuid}`, { responseType: "blob" });

/**
 * Absolute URL of a server-supplied /comment path. Attachment reads and avatar
 * reads are permit-all at the gateway, so a plain <img src> / <a href> works —
 * no credential needed. `relative` is the downloadUrl / avatarUrl the API
 * returns (already prefixed with /comment); callers join it onto the gateway
 * base rather than hand-building a path.
 */
export const commentFileUrl = (relative) => (relative ? `${config.baseURL}${relative}` : "");
