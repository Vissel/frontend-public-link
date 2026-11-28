import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Divider, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../AuthContext";
import CommentComposer from "./CommentComposer";
import CommentItem from "./CommentItem";
import { deleteComment, editComment, fetchComments, fetchReplies, postComment } from "../../api/commentApi";
import { buildCommentTree } from "../../util/commentFormat";

const PAGE_SIZE = 20;

const buildFormData = ({ targetType, targetId, parentUuid, content, files }) => {
  const fd = new FormData();
  fd.append("targetType", targetType);
  fd.append("targetId", targetId);
  if (parentUuid) fd.append("parentUuid", parentUuid);
  if (content) fd.append("content", content);
  (files || []).forEach((file) => fd.append("files", file));
  return fd;
};

/**
 * Reusable comment section for any target: pass targetType ("PRODUCT", "POST",
 * "GUIDELINE") and targetId. It owns all data fetching, ordering, threading and
 * write actions, so future post/guideline pages mount it with different props
 * and change nothing here.
 *
 * Ordering comes straight from the server (newest activity first, a reply lifts
 * its whole tree), so this component only renders the returned order.
 */
const CommentSection = ({ targetType, targetId, title, showTitle = true, limit = PAGE_SIZE }) => {
  const { t } = useTranslation();
  const { isAuthenticated, username } = useAuth();

  const [roots, setRoots] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workingUuid, setWorkingUuid] = useState("");
  // uuid -> { replies: [flat], loaded: bool, loading: bool }
  const [threads, setThreads] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchComments({ targetType, targetId, limit });
      setRoots(data?.items || []);
      setNextCursor(data?.nextCursor || null);
      setThreads({});
    } catch (e) {
      setError(t("comment.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, limit, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMoreRoots = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const { data } = await fetchComments({ targetType, targetId, cursor: nextCursor, limit });
      setRoots((prev) => [...prev, ...(data?.items || [])]);
      setNextCursor(data?.nextCursor || null);
    } catch (e) {
      setError(t("comment.errors.load"));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadReplies = useCallback(
    async (rootUuid) => {
      setThreads((prev) => ({ ...prev, [rootUuid]: { ...(prev[rootUuid] || {}), loading: true } }));
      try {
        const { data } = await fetchReplies(rootUuid);
        const replies = data?.replies || [];
        setThreads((prev) => ({
          ...prev,
          [rootUuid]: { replies, loaded: true, loading: false },
        }));
      } catch (e) {
        setThreads((prev) => ({
          ...prev,
          [rootUuid]: { ...(prev[rootUuid] || {}), loading: false },
        }));
        setError(t("comment.errors.load"));
      }
    },
    [t]
  );

  // After any write, the ordering (a reply lifts its tree) and reply counts can
  // change, so reload the roots and any thread already expanded.
  const refresh = useCallback(async () => {
    const expanded = Object.keys(threads).filter((uuid) => threads[uuid]?.loaded);
    const { data } = await fetchComments({ targetType, targetId, limit });
    setRoots(data?.items || []);
    setNextCursor(data?.nextCursor || null);
    const nextThreads = {};
    await Promise.all(
      expanded.map(async (uuid) => {
        try {
          const res = await fetchReplies(uuid);
          nextThreads[uuid] = { replies: res.data?.replies || [], loaded: true, loading: false };
        } catch (e) {
          /* leave this thread collapsed if its refresh failed */
        }
      })
    );
    setThreads((prev) => {
      // keep any thread not reloaded as-is, override the refreshed ones
      const merged = { ...prev };
      expanded.forEach((uuid) => {
        if (nextThreads[uuid]) merged[uuid] = nextThreads[uuid];
      });
      return merged;
    });
  }, [threads, targetType, targetId, limit]);

  const submitRoot = async ({ content, files }) => {
    if (!isAuthenticated) return;
    setSubmitting(true);
    setError("");
    try {
      await postComment(buildFormData({ targetType, targetId, content, files }));
      await refresh();
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parent, { content, files }) => {
    setWorkingUuid(parent.uuid);
    setError("");
    try {
      await postComment(
        buildFormData({ targetType, targetId, parentUuid: parent.uuid, content, files })
      );
      await refresh();
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setWorkingUuid("");
    }
  };

  const submitEdit = async (comment, content) => {
    setWorkingUuid(comment.uuid);
    setError("");
    try {
      await editComment(comment.uuid, content);
      await refresh();
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setWorkingUuid("");
    }
  };

  const submitDelete = async (comment) => {
    if (!window.confirm(t("comment.deleteConfirm"))) return;
    setWorkingUuid(comment.uuid);
    setError("");
    try {
      await deleteComment(comment.uuid);
      await refresh();
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setWorkingUuid("");
    }
  };

  return (
    <Stack spacing={1.5}>
      {showTitle ? (
        <Typography variant="h4">{title || t("comment.title")}</Typography>
      ) : null}

      {error ? (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {/* New-comment composer: a signed-in user posts; an anonymous buyer sees a
          login hint instead (reads are public, writes need the gateway JWT). */}
      {isAuthenticated ? (
        <Box>
          <CommentComposer onSubmit={submitRoot} working={submitting} submitLabelKey="comment.post" />
        </Box>
      ) : (
        <Alert severity="info">{t("comment.loginToComment")}</Alert>
      )}

      <Divider />

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          {t("comment.loading")}
        </Typography>
      ) : roots.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("comment.empty")}
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />} spacing={0.5}>
          {roots.map((root) => {
            const thread = threads[root.uuid];
            const flat = thread?.replies ?? root.previewReplies ?? [];
            const loaded = thread?.loaded ?? (root.previewReplies?.length ?? 0) >= (root.replyCount ?? 0);
            return (
              <CommentItem
                key={root.uuid}
                comment={root}
                isRoot
                childrenNodes={buildCommentTree(flat)}
                replyCount={root.replyCount ?? 0}
                repliesLoaded={loaded}
                loadingReplies={Boolean(thread?.loading)}
                onLoadReplies={(c) => loadReplies(c.uuid)}
                canPost={isAuthenticated}
                currentUser={username}
                onReply={submitReply}
                onEdit={submitEdit}
                onDelete={submitDelete}
                workingUuid={workingUuid}
              />
            );
          })}
        </Stack>
      )}

      {nextCursor ? (
        <Button onClick={loadMoreRoots} disabled={loadingMore} sx={{ alignSelf: "center", fontWeight: 600 }}>
          {loadingMore ? t("comment.loading") : t("comment.loadMore")}
        </Button>
      ) : null}
    </Stack>
  );
};

/** Map a write failure's server status onto a localised reason. */
const writeErrorMessage = (e, t) => {
  const status = e?.response?.status;
  if (status === 401 || status === 403) return t("comment.errors.forbidden");
  if (status === 413) return t("comment.errors.tooLarge", { max: "10 MB" });
  if (status === 415) return t("comment.errors.filetype");
  return t("comment.errors.submit");
};

export default CommentSection;
