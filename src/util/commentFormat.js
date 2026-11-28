import dayjs from "dayjs";

/**
 * Comment display helpers.
 *
 * The requirement is "must display datetime comment": every comment shows the
 * instant it was posted. The project's date rule is day-first (dd/mm/yyyy), so
 * the backend ISO-8601 UTC string is rendered as DD/MM/YYYY HH:mm in the
 * viewer's local time via dayjs (already a dependency, and the same adapter the
 * pickers use). A blank/invalid stamp yields an empty string rather than
 * "Invalid Date".
 */
export const formatCommentDateTime = (iso) => {
  if (!iso) return "";
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY HH:mm") : "";
};

/** Full "last edited" stamp, shown next to the created time only once edited. */
export const formatCommentEditedAt = (iso) => {
  if (!iso) return "";
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY HH:mm") : "";
};

/**
 * Turn one thread's flat reply list into a nested tree for rendering.
 *
 * The backend returns every reply of a thread in one chronological list (each
 * reply carries its parentUuid); the client re-groups it so a sub-reply renders
 * under the message it addresses. The root is not part of the list, so replies
 * whose parent is the root (or missing from this page) become top-level nodes.
 * Depth for display is capped by the renderer, not here — the full parent chain
 * is preserved so "replying to @name" stays correct at any depth.
 */
export const buildCommentTree = (replies = []) => {
  const byUuid = new Map();
  replies.forEach((reply) => byUuid.set(reply.uuid, { comment: reply, children: [] }));

  const roots = [];
  replies.forEach((reply) => {
    const node = byUuid.get(reply.uuid);
    const parent = reply.parentUuid ? byUuid.get(reply.parentUuid) : null;
    // A missing parent means it is the thread root (not in this list) or an
    // earlier page's comment: hang the node at the top level in both cases.
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};
