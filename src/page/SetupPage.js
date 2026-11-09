import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
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
import SectionBlock from "../components/SectionBlock";
import TransferInfoManager from "../components/TransferInfoManager";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";
const DEFAULT_ROWS = 10;
const ROWS_OPTIONS = [5, 10, 25, 50];
const SEARCH_DEBOUNCE_MS = 400;

const STATE_CREATE = "CREATE";
const STATE_ACTIVE = "ACTIVE";
const STATE_ALL = "ALL";

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

/**
 * One payment-plan assignment table (search / filter / pagination /
 * multi-select). The JS-first search rule: the typed term filters the loaded
 * rows; only when nothing matches is the server queried with the same term.
 */
const PlanAssignmentTable = ({
  title,
  description,
  state,
  showStateToggle,
  actionLabel,
  onRowsChange,
  bulkActions,
  rowAction,
  emptyMessage,
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
      await loadFromServer(page, rowsPerPage);
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
            <Typography variant="body2" color="text.secondary">
              {t("setup.selected")}: {selected.length}
            </Typography>
            {bulkActions.map((action) => (
              <Button
                key={action.key}
                size="small"
                variant={action.variant || "outlined"}
                color={action.color || "primary"}
                disabled={action.needsDate && !action.dateValue}
                onClick={() =>
                  runBulk((codes) => action.handler(codes, action), action.successMessage)
                }
              >
                {action.label}
              </Button>
            ))}
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
                {rowAction && <TableCell align="right">{t("setup.column.action")}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {locallyFiltered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={rowAction ? 11 : 10}>
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
                    <Chip size="small" color={stateColor(row.planState)} label={row.planState} />
                  </TableCell>
                  <TableCell>{row.activeDate || "-"}</TableCell>
                  <TableCell>{row.endedDate || "-"}</TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography variant="caption">{row.paymentStatus || "-"}</Typography>
                      {row.paymentCode && (
                        <Typography variant="caption" color="text.secondary">
                          {row.paymentCode.slice(0, 8)}…
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  {rowAction && (
                    <TableCell align="right">
                      <Button size="small" onClick={() => rowAction(row)}>
                        {t("setup.action.markPaid")}
                      </Button>
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
 * Admin setup page: approve the CREATE queue, review every assignment and
 * maintain the admin transfer accounts used on the seller payment page.
 */
const SetupPage = () => {
  const { t } = useTranslation();
  const [activeDate, setActiveDate] = useState("");

  const dateValue = useMemo(() => (activeDate || "").slice(0, 10), [activeDate]);

  const approve = async (codes) => {
    await api.post(`${contextPath}/admin/v1/paymentPlan/approve`, {
      planUserCodes: codes,
      activeDate: dateValue || null,
    });
  };

  const reject = async (codes) => {
    await api.post(`${contextPath}/admin/v1/paymentPlan/reject`, { planUserCodes: codes });
  };

  const markPaid = async (row) => {
    if (!row.paymentCode) {
      return;
    }
    await api.post(`${contextPath}/admin/v1/paymentPlan/payment/markPaid`, {
      paymentCode: row.paymentCode,
      note: t("setup.billNote"),
    });
  };

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
          <TextField
            size="small"
            type="date"
            label={t("setup.activeDate")}
            value={activeDate}
            onChange={(event) => setActiveDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="caption" color="text.secondary">
            {t("setup.activeDateHint")}
          </Typography>
        </Stack>

        <PlanAssignmentTable
          title={t("setup.pendingTitle")}
          description={t("setup.pendingDesc")}
          state={STATE_CREATE}
          emptyMessage={t("setup.pendingEmpty")}
          bulkActions={[
            {
              key: "approve",
              label: t("setup.action.approve"),
              handler: approve,
              needsDate: true,
              dateValue,
              variant: "contained",
              successMessage: t("setup.success.approved"),
            },
            {
              key: "reject",
              label: t("setup.action.reject"),
              handler: reject,
              color: "error",
              successMessage: t("setup.success.rejected"),
            },
          ]}
        />

        <PlanAssignmentTable
          title={t("setup.allTitle")}
          description={t("setup.allDesc")}
          state={STATE_ACTIVE}
          showStateToggle
          actionLabel={t("setup.toggleState")}
          rowAction={markPaid}
          bulkActions={[
            {
              key: "activate",
              label: t("setup.action.activate"),
              handler: approve,
              needsDate: true,
              dateValue,
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
        />

        <SectionBlock title={t("setup.transferTitle")} description={t("setup.transferDesc")}>
          <TransferInfoManager />
        </SectionBlock>
      </Stack>
    </PageContainer>
  );
};

export default SetupPage;
