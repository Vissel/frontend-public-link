import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import api from "../api";
import PageContainer from "../components/PageContainer";
import ExtendPlanDialog from "../components/ExtendPlanDialog";
import PaymentLinksDialog from "../components/PaymentLinksDialog";
import PlanStartDialog from "../components/PlanStartDialog";
import SectionBlock from "../components/SectionBlock";
import TransferInfoManager from "../components/TransferInfoManager";
import { useTranslation } from "react-i18next";
import { groupColor, normalizeGroup } from "../util/planGroup";
import { DateTimePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";

const contextPath = "/publiclink";
const DEFAULT_ROWS = 10;
const ROWS_OPTIONS = [5, 10, 25, 50];
const SEARCH_DEBOUNCE_MS = 400;

const STATE_CREATE = "CREATE";
const STATE_ACTIVE = "ACTIVE";
const STATE_ALL = "ALL";

/** Wire format of a chosen plan start, shared with the server. */
const WIRE_FORMAT = "YYYY-MM-DDTHH:mm";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

const buildListPayload = (page, size, filters = {}) => ({
  page,
  size,
  listData: [
    {
      state: filters.state || null,
      username: filters.username || null,
    },
  ],
});

const fetchPlanPage = async (page, size, filters = {}) => {
  const res = await api.post(
    `${contextPath}/admin/v1/paymentPlan/list`,
    buildListPayload(page, size, filters)
  );
  return { items: res.data?.items || [], total: res.data?.total || 0 };
};

const stateColor = (state) => {
  if (state === "ACTIVE") return "success";
  if (state === "CREATE") return "warning";
  return "default";
};

// Payment money flow: CREATE (nothing received) -> WAITING_CONFIRM (seller said
// it was sent) -> PAID. Anything else is a dead end, so it stays grey.
const paymentColor = (status) => {
  if (status === "PAID" || status === "CONFIRMED") return "success";
  if (status === "WAITING_CONFIRM") return "warning";
  if (status === "REJECTED") return "error";
  return "default";
};

const frontendOrigin = window.location.origin;

const addHostToHref = (link) => {
  if (!link) return "";
  return /^https?:\/\//i.test(link) ? link : `${frontendOrigin}${link}`;
};

/**
 * One payment-plan assignment table (search / filter / pagination /
 * multi-select). The JS-first search rule: the typed term filters the loaded
 * rows; only when nothing matches is the server queried with the same term.
 * Actions live in a toolbar above the table and run on the checked rows, so
 * the admin never has to hunt for a button inside a long row. A per-row action
 * is the exception: it belongs to one plan and has no bulk meaning.
 * Every table of the page shares the page's reload token: when an action moves
 * a plan from one table to the other, the token changes and both tables
 * re-fetch, so the admin sees the result without reloading the browser.
 */
const PlanAssignmentTable = ({
  title,
  description,
  state,
  showStateToggle,
  actionLabel,
  onRowsChange,
  bulkActions,
  emptyMessage,
  rowActions,
  reloadToken,
  onCompleted,
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS);
  const [effectiveState, setEffectiveState] = useState(state);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [copiedKey, setCopiedKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverSearchActive, setServerSearchActive] = useState(false);
  const fallbackRef = useRef(null);

  useEffect(() => {
    setEffectiveState(state);
    setServerSearchActive(false);
    setSearchText("");
    setAppliedSearch("");
    setPage(1);
  }, [state]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAppliedSearch(searchText.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  const loadFromServer = useCallback(
    async (pageNumber, size, options = {}) => {
      try {
        setLoading(true);
        setError("");
        const { items, total: nextTotal } = await fetchPlanPage(pageNumber, size, {
          state: options.state ?? effectiveState,
          username: options.username ?? (serverSearchActive ? appliedSearch : null),
        });
        setRows(items);
        setTotal(nextTotal);
        onRowsChange?.(items);
        return items;
      } catch (err) {
        console.error("Failed to load payment plan assignments", err);
        setError(t("setup.errors.load"));
        return [];
      } finally {
        setLoading(false);
      }
    },
    [effectiveState, onRowsChange, serverSearchActive, appliedSearch, t]
  );

  useEffect(() => {
    loadFromServer(page, rowsPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, effectiveState]);

  // The mount render already loaded, so only an actual token change re-fetches.
  // Comparing against the seen value keeps a double effect run (StrictMode) a
  // no-op instead of a duplicate request.
  const seenTokenRef = useRef(reloadToken);
  useEffect(() => {
    if (reloadToken === seenTokenRef.current) {
      return;
    }
    seenTokenRef.current = reloadToken;
    loadFromServer(page, rowsPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // Local (JavaScript first) filtering of the loaded page
  const locallyFiltered = useMemo(() => {
    if (!appliedSearch || serverSearchActive) {
      return rows;
    }
    const term = appliedSearch.toLowerCase();
    return rows.filter(
      (row) =>
        (row.username || "").toLowerCase().includes(term) ||
        (row.displayName || "").toLowerCase().includes(term)
    );
  }, [appliedSearch, rows, serverSearchActive]);

  // 0 local match -> re-query the API with the search term in the payload.
  // Clearing the term drops back to plain server pagination.
  useEffect(() => {
    if (appliedSearch && !serverSearchActive && locallyFiltered.length === 0
      && fallbackRef.current !== appliedSearch) {
      fallbackRef.current = appliedSearch;
      setServerSearchActive(true);
      setPage(1);
      loadFromServer(1, rowsPerPage, { username: appliedSearch });
      return;
    }

    if (!appliedSearch && serverSearchActive) {
      fallbackRef.current = null;
      setServerSearchActive(false);
      setPage(1);
      loadFromServer(1, rowsPerPage, { username: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, locallyFiltered, serverSearchActive]);

  const hasRowActions = Boolean(rowActions && rowActions.length > 0);

  const allSelected =
    locallyFiltered.length > 0 && locallyFiltered.every((row) => selected.includes(row.planUserCode));

  const toggleRow = (planUserCode) => {
    setSelected((prev) =>
      prev.includes(planUserCode) ? prev.filter((code) => code !== planUserCode) : [...prev, planUserCode]
    );
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : locallyFiltered.map((row) => row.planUserCode));
  };

  const markCopied = (key) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const fallbackCopy = (text, onDone) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      onDone();
    } catch (err) {
      console.error("Copy failed", err);
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const handleCopyText = (key, text) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => markCopied(key)).catch(() => fallbackCopy(text, () => markCopied(key)));
      return;
    }
    fallbackCopy(text, () => markCopied(key));
  };

  const runBulk = async (handler, successMessage) => {
    if (selected.length === 0) {
      setError(t("setup.errors.noSelection"));
      return;
    }
    setError("");
    setNotice("");
    try {
      await handler(selected);
      setSelected([]);
      if (successMessage) {
        setNotice(successMessage);
      }
      // Let the page refresh every table instead of only this one: a plan that
      // just became active has left this queue and belongs to the other table.
      if (onCompleted) {
        onCompleted();
      } else {
        await loadFromServer(page, rowsPerPage);
      }
    } catch (err) {
      console.error("Bulk action failed", err);
      setError(err?.response?.data?.errorMessage || t("setup.errors.bulkAction"));
    }
  };

  return (
    <SectionBlock title={title} description={description}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
          <TextField
            size="small"
            label={t("setup.search")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            sx={{ minWidth: 240 }}
          />
          {showStateToggle && (
            <Button
              size="small"
              variant={effectiveState === STATE_ALL ? "contained" : "outlined"}
              onClick={() => {
                setServerSearchActive(false);
                setSearchText("");
                setPage(1);
                setEffectiveState((prev) => (prev === STATE_ALL ? STATE_ACTIVE : STATE_ALL));
              }}
            >
              {actionLabel ||
                (effectiveState === STATE_ALL ? t("setup.showActive") : t("setup.showAll"))}
            </Button>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
            {t("setup.total")} {total}
          </Typography>
        </Stack>

        {bulkActions && bulkActions.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              {t("setup.selected")}: {selected.length}
            </Typography>
            {bulkActions.map((action) => {
              // The actions only ever mean "do this to what I picked", so an
              // empty selection greys them out instead of failing on click. The
              // start field may stay empty: blank means "use the seller's start".
              const selectionMissing = selected.length === 0;
              return (
                <Button
                  key={action.key}
                  size="small"
                  variant={action.variant || "outlined"}
                  color={action.color || "primary"}
                  disabled={selectionMissing}
                  title={selectionMissing ? t("setup.errors.noSelection") : undefined}
                  onClick={() =>
                    runBulk((codes) => action.handler(codes, action), action.successMessage)
                  }
                >
                  {action.label}
                </Button>
              );
            })}
          </Stack>
        )}

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={allSelected} onChange={toggleAll} />
                </TableCell>
                <TableCell>{t("setup.column.user")}</TableCell>
                <TableCell>{t("setup.column.name")}</TableCell>
                <TableCell align="right">{t("setup.column.fee")}</TableCell>
                <TableCell align="center">{t("setup.column.days")}</TableCell>
                <TableCell align="center">{t("setup.column.quota")}</TableCell>
                <TableCell>{t("setup.column.state")}</TableCell>
                <TableCell>{t("setup.column.activeDate")}</TableCell>
                <TableCell>{t("setup.column.endedDate")}</TableCell>
                <TableCell>{t("setup.column.payment")}</TableCell>
                {hasRowActions && (
                  <TableCell align="right">{t("setup.column.action")}</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {locallyFiltered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={hasRowActions ? 11 : 10}>
                    <Typography variant="body2" color="text.secondary">
                      {loading ? t("common.loading") : emptyMessage || t("common.noRecords")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {locallyFiltered.map((row) => (
                <TableRow key={row.planUserCode} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.includes(row.planUserCode)}
                      onChange={() => toggleRow(row.planUserCode)}
                      slotProps={{ input: { "aria-label": row.planUserCode } }}
                    />
                  </TableCell>
                  <TableCell>{row.username}</TableCell>
                  <TableCell>{row.displayName || "-"}</TableCell>
                  <TableCell align="right">{formatVND(row.fee)}</TableCell>
                  <TableCell align="center">{row.planDay}</TableCell>
                  <TableCell align="center">
                    {row.usedCount}/{row.envQuota}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                      <Chip size="small" color={stateColor(row.planState)} label={row.planState} />
                      {row.extendDays ? (
                        // A queue row that buys days on another plan: no quota of
                        // its own, so say so instead of leaving "0/0" unexplained.
                        <Chip
                          size="small"
                          variant="outlined"
                          color="info"
                          label={t("setup.extensionTag")}
                          onClick={() => { }}
                          clickable={false}
                        />
                      ) : null}
                      {row.convertsPlanUserCode ? (
                        // Same trap as an extension: this row moves another plan
                        // onto a better catalog entry, and its fee is the
                        // difference rather than a full price.
                        <Chip
                          size="small"
                          variant="outlined"
                          color="secondary"
                          label={t("setup.conversionTag")}
                          onClick={() => { }}
                          clickable={false}
                        />
                      ) : null}
                      <Chip
                        size="small"
                        variant="outlined"
                        color={groupColor(row.planGroup)}
                        label={t(`plans.group.${normalizeGroup(row.planGroup)}.label`)}
                        onClick={() => { }}
                        clickable={false}
                      />
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{row.activeDate || "-"}</Typography>
                      {/* What the seller asked for when buying the plan
                          themselves. The date field above the table is the
                          override: left on today the request is honoured. */}
                      {row.planState === "CREATE" && row.requestedStartAt ? (
                        <Typography variant="caption" color="primary">
                          {t("setup.requestedStart", { date: row.requestedStartAt })}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell>{row.endedDate || "-"}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        label={row.paymentStatus || "-"}
                        color={paymentColor(row.paymentStatus)}
                        onClick={() => { }}
                        clickable={false}
                      />
                      {row.paymentUrl && (
                        <>
                          <Link
                            href={addHostToHref(row.paymentUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            title={addHostToHref(row.paymentUrl)}
                          >
                            {t("setup.column.paymentLink")}
                          </Link>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCopyText(`link-${row.planUserCode}`, addHostToHref(row.paymentUrl));
                            }}
                            title={addHostToHref(row.paymentUrl)}
                            sx={{ minWidth: 60, fontSize: "0.7rem" }}
                          >
                            {copiedKey === `link-${row.planUserCode}`
                              ? t("common.copied")
                              : t("common.copy")}
                          </Button>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                  {hasRowActions && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                        {rowActions.map((action) => (
                          <Button
                            key={action.key || action.label}
                            size="small"
                            variant="outlined"
                            disabled={!!action.reasonFor?.(row)}
                            title={action.reasonFor?.(row)}
                            onClick={(event) => {
                              event.stopPropagation();
                              action.handler(row);
                            }}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page - 1}
          onPageChange={(_event, nextPage) => setPage(nextPage + 1)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(1);
          }}
          rowsPerPageOptions={ROWS_OPTIONS}
        />
      </Stack>
    </SectionBlock>
  );
};

/**
 * Admin setup page: collect the money of the "Waiting for pay" queue, approve
 * the assignments, review every plan and maintain the admin transfer accounts
 * used on the seller payment page.
 */
const SetupPage = () => {
  const { t } = useTranslation();
  // Empty on purpose: blank means "use the start the seller asked for", and
  // only a value typed here is a deliberate override - today at a time
  // included, which the old date field could not express.
  const [startAt, setStartAt] = useState("");
  const [linkItems, setLinkItems] = useState([]);
  const [linksOpen, setLinksOpen] = useState(false);
  const [extendRow, setExtendRow] = useState(null);
  const [startRow, setStartRow] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const approve = async (codes) => {
    await api.post(`${contextPath}/admin/v1/paymentPlan/approve`, {
      planUserCodes: codes,
      startAt: startAt || null,
    });
  };

  const reject = async (codes) => {
    await api.post(`${contextPath}/admin/v1/paymentPlan/reject`, { planUserCodes: codes });
  };

  // Both tables re-fetch on a token change, so a plan that just moved from one
  // queue to the other shows up in its new table without a browser reload.
  const refreshTables = () => setReloadToken((token) => token + 1);

  // Receiving the money starts the plan from the start above (the seller's own
  // when the field is empty), so the row leaves "Waiting for pay" and lands in
  // the plan list.
  const markPaid = async (codes) => {
    await api.post(`${contextPath}/admin/v1/paymentPlan/payment/markPaid`, {
      planUserCodes: codes,
      note: t("setup.billNote"),
      startAt: startAt || null,
    });
  };

  // The server builds a fresh token per selected plan and answers with the
  // links; the dialog is the feedback, so no success alert on top of it.
  const regenerateLinks = async (codes) => {
    const res = await api.post(
      `${contextPath}/admin/v1/paymentPlan/payment/regenerateLink`,
      { planUserCodes: codes }
    );
    setLinkItems(res.data?.items || []);
    setLinksOpen(true);
  };

  // Sell extra days on a running plan. The order lands in "Waiting for pay"
  // with its own link; the plan's end date only moves once that order is paid.
  const submitExtend = async (days) => {
    if (!extendRow) return;
    try {
      const res = await api.post(`${contextPath}/admin/v1/paymentPlan/extend`, {
        planUserCode: extendRow.planUserCode,
        days,
      });
      setExtendRow(null);
      refreshTables();
      setLinkItems([
        {
          planUserCode: res.data?.extensionPlanUserCode,
          username: res.data?.sellerUsername || extendRow.username,
          paymentStatus: res.data?.status,
          paymentUrl: res.data?.paymentUrl,
        },
      ]);
      setLinksOpen(true);
    } catch (err) {
      console.error("Failed to extend plan", err);
      alert(err?.response?.data?.errorMessage || t("setup.errors.actionFailed"));
    }
  };

  // One plan, one start: the bulk field above would apply the same value to
  // every selected row, so a correction goes through this dialog instead.
  const submitStart = async (nextStartAt) => {
    if (!startRow) {
      return;
    }
    await api.post(`${contextPath}/admin/v1/paymentPlan/start`, {
      planUserCodes: [startRow.planUserCode],
      startAt: nextStartAt,
    });
    setStartRow(null);
    refreshTables();
  };

  const paymentActions = [
    {
      key: "markPaid",
      label: t("setup.action.markPaid"),
      handler: markPaid,
      variant: "contained",
      color: "success",
      successMessage: t("setup.success.paid"),
    },
    {
      key: "regenerateLink",
      label: t("setup.action.regenerateLink"),
      handler: regenerateLinks,
      color: "info",
    },
  ];

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <Box>
          <Typography variant="h3" gutterBottom>
            {t("setup.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("setup.subtitle")}
          </Typography>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "flex-end" }}>
          <DateTimePicker
            label={t("setup.start")}
            ampm={false}
            format="DD/MM/YYYY HH:mm"
            value={startAt ? dayjs(startAt) : null}
            onChange={(value) => setStartAt(value ? value.format(WIRE_FORMAT) : "")}
            slotProps={{ textField: { size: "small" } }}
          />
          <Typography variant="caption" color="text.secondary">
            {t("setup.startHint")}
          </Typography>
        </Stack>

        <PlanAssignmentTable
          title={t("setup.pendingTitle")}
          description={t("setup.pendingDesc")}
          state={STATE_CREATE}
          emptyMessage={t("setup.pendingEmpty")}
          reloadToken={reloadToken}
          onCompleted={refreshTables}
          bulkActions={[
            ...paymentActions,
            {
              key: "reject",
              label: t("setup.action.reject"),
              handler: reject,
              color: "error",
              successMessage: t("setup.success.rejected"),
            },
          ]}
          rowActions={[
            {
              key: "setStart",
              label: t("setup.action.setStart"),
              handler: setStartRow,
              // An extension or conversion order is money for another plan, so
              // it has no window of its own to move.
              reasonFor: (row) =>
                row.extendDays || row.convertsPlanUserCode ? t("setup.startRules.onlyPlans") : undefined,
            },
          ]}
        />

        <PlanAssignmentTable
          title={t("setup.allTitle")}
          description={t("setup.allDesc")}
          state={STATE_ACTIVE}
          showStateToggle
          actionLabel={t("setup.toggleState")}
          reloadToken={reloadToken}
          onCompleted={refreshTables}
          bulkActions={[
            {
              key: "activate",
              label: t("setup.action.activate"),
              handler: approve,
              variant: "contained",
              successMessage: t("setup.success.activated"),
            },
            {
              key: "deactivate",
              label: t("setup.action.deactivate"),
              handler: reject,
              color: "error",
              successMessage: t("setup.success.deactivated"),
            },
          ]}
          rowActions={[
            {
              key: "extend",
              label: t("setup.action.extend"),
              handler: setExtendRow,
              // Only a running plan has an end date to push back; the server
              // refuses anything else, so the button says why it is greyed out.
              reasonFor: (row) =>
                row.planState === STATE_ACTIVE ? undefined : t("setup.extend.onlyActive"),
            },
            {
              key: "changeStart",
              label: t("setup.action.changeStart"),
              handler: setStartRow,
              reasonFor: (row) =>
                row.planState === STATE_ACTIVE && !row.extendDays && !row.convertsPlanUserCode
                  ? undefined
                  : t("setup.startRules.onlyRunning"),
            },
          ]}
        />

        <SectionBlock title={t("setup.transferTitle")} description={t("setup.transferDesc")}>
          <TransferInfoManager />
        </SectionBlock>

        <PaymentLinksDialog
          open={linksOpen}
          items={linkItems}
          onClose={() => setLinksOpen(false)}
        />

        <ExtendPlanDialog
          open={!!extendRow}
          row={extendRow}
          onClose={() => setExtendRow(null)}
          onSubmit={submitExtend}
        />

        <PlanStartDialog
          open={!!startRow}
          row={startRow}
          onClose={() => setStartRow(null)}
          onSubmit={submitStart}
        />
      </Stack>
    </PageContainer>
  );
};

export default SetupPage;
