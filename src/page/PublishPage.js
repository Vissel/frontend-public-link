import React, { useEffect, useState, useRef } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import api from "../api";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import { useTranslation } from "react-i18next";

const SaleEnvPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParam = new URLSearchParams(location.search);
  const paramValue = queryParam.get("token");
  const { userRole, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [orderList, setOrderList] = useState([]);
  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saleEnv, setSaleEnv] = useState({
    sellerName: "",
    productName: "",
  });
  const orderListRef = useRef([]);
  const isSeller =
    String(userRole || "").toLowerCase() === "seller" &&
    saleEnv.sellerName === userName;
  const { t } = useTranslation();

  const totalAmount = isSeller
    ? orderList.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : 0;
  const totalOrder = isSeller ? orderList.length : 0;

  useEffect(() => {
    orderListRef.current = orderList;
  }, [orderList]);

  const handleOrder = async (event) => {
    event.preventDefault();
    setFeedback(null);
    setError("");

    if (!buyer.trim() || !amount) {
      setFeedback({
        severity: "error",
        message: t("publish.errors.buyerAmountRequired"),
      });
      return;
    }

    setSubmittingOrder(true);
    try {
      const requestNewOrder = {
        orderedTime: "",
        buyer: buyer.trim(),
        token: paramValue,
        amount,
        note,
      };
      const response = await api.post("/public/order", requestNewOrder);
      if (response.status === 200) {
        setOrderList((prevList) => [response.data, ...prevList]);
        setBuyer("");
        setAmount("");
        setNote("");
        setFeedback({
          severity: "success",
          message: t("publish.success.orderCreated"),
        });
      }
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError?.response?.data?.message ||
          t("publish.errors.submitOrderFailed")
      );
    } finally {
      setSubmittingOrder(false);
    }
  };

  useEffect(() => {
    if (paramValue) {
      setLoading(true);
      const fetchData = async () => {
        try {
          setError("");
          const response = await api.get(`/public/link?token=${paramValue}`);
          if (response.status !== 200) {
            navigate("/error");
          }
          const result = response.data;
          setSaleEnv({
            sellerName: result.sellerName || "",
            productName: result.productName || "",
          });
          setOrderList(result.orders || []);
        } catch (e) {
          console.error("Sale environment fetch failed:", e);
          setError(
            e?.response?.data?.message ||
              t("publish.errors.loadFailed")
          );
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    } else {
      setError(t("publish.errors.missingToken"));
    }
  }, [paramValue, navigate]);

  const handleDelivered = async (index, event) => {
    const order = orderList[index];

    try {
      const orderPayload = {
        orderId: order.orderId,
        token: paramValue,
      };

      const response = await api.post(
        `/public/order/delivery?delivered=${event.target.checked}`,
        orderPayload
      );
      if (response.status !== 200) throw new Error("Update delivery failed");

      setOrderList((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, delivered: response.data } : item
        )
      );
    } catch (err) {
      console.error(err);
      setFeedback({
        severity: "error",
        message: t("publish.errors.deliveryUpdateFailed"),
      });
    }
  };

  const handleGetMoney = async (index, event) => {
    const order = orderList[index];

    try {
      const orderPayload = {
        orderId: order.orderId,
        token: paramValue,
      };

      const response = await api.post(
        `/public/order/getmoney?getMoney=${event.target.checked}`,
        orderPayload
      );
      if (response.status !== 200) throw new Error("Update getmoney failed");

      setOrderList((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, getMoney: response.data } : item
        )
      );
    } catch (err) {
      console.error(err);
      setFeedback({
        severity: "error",
        message: t("publish.errors.paymentUpdateFailed"),
      });
    }
  };

  const noteTimers = useRef({});

  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const handleNoteChange = (index, value) => {
    setOrderList((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, sellerNote: value } : item
      )
    );

    const orderKey = orderListRef.current[index]?.orderId ?? index;
    clearTimeout(noteTimers.current[orderKey]);

    noteTimers.current[orderKey] = setTimeout(async () => {
      try {
        const order = orderListRef.current.find((item, itemIndex) => {
          const itemKey = item.orderId ?? itemIndex;
          return itemKey === orderKey;
        });
        if (!order) {
          return;
        }
        await api.post("/public/order/note", {
          ...order,
          sellerNote: value,
        });
      } catch (err) {
        console.error(err);
        setFeedback({
          severity: "error",
          message: t("publish.errors.noteSaveFailed"),
        });
      }
    }, 500);
  };

  const exportToExcel = () => {
    const worksheetData = orderList.map((order) => ({
      [t("publish.excel.orderTime")]: order.orderedTime,
      [t("publish.excel.apartment")]: order.buyer,
      [t("publish.excel.quantity")]: order.amount,
      [t("publish.excel.orderNote")]: order.note,
      [t("publish.excel.delivered")]: order.delivered ? t("common.yes") : t("common.no"),
      [t("publish.excel.paid")]: order.getMoney ? t("common.yes") : t("common.no"),
      [t("publish.excel.note")]: order.sellerNote,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Order");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });

    saveAs(
      blob,
      `${t("publish.excel.fileName")}-${saleEnv.sellerName}-${
        saleEnv.productName
      }-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <PageContainer maxWidth="xl">
      <Stack spacing={3}>
        <SectionBlock
          title={t("publish.title", {
            product: saleEnv.productName || t("publish.defaultProduct"),
            seller: saleEnv.sellerName || t("publish.defaultSeller"),
          })}
          description={t("publish.description")}
          action={
            isSeller ? (
              <Button variant="contained" color="success" onClick={exportToExcel}>
                {t("publish.exportExcel")}
              </Button>
            ) : null
          }
        >
          <Stack spacing={2}>
            {loading && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  {t("common.loading")}
                </Typography>
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {feedback && (
              <Alert severity={feedback.severity}>{feedback.message}</Alert>
            )}

            <Box component="form" onSubmit={handleOrder}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label={t("publish.apartment")}
                    value={buyer}
                    onChange={(event) =>
                      setBuyer(event.target.value.toUpperCase())
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label={t("publish.quantity")}
                    type="number"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label={t("publish.note")}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: "stretch", md: "center" }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {t("publish.fillOrderInfo")}
                    </Typography>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={submittingOrder}
                    >
                      {t("publish.placeOrder")}
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          </Stack>
        </SectionBlock>

        {isSeller && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <CardWrapper>
                <Stack spacing={0.5}>
                  <Typography variant="overline" color="text.secondary">
                    {t("publish.totalAmount")}
                  </Typography>
                  <Typography variant="h4">{totalAmount}</Typography>
                </Stack>
              </CardWrapper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <CardWrapper>
                <Stack spacing={0.5}>
                  <Typography variant="overline" color="text.secondary">
                    {t("publish.totalApartment")}
                  </Typography>
                  <Typography variant="h4">{totalOrder}</Typography>
                </Stack>
              </CardWrapper>
            </Grid>
          </Grid>
        )}

        <SectionBlock
          title={t("publish.orderInfo")}
          description={t("publish.orderInfoDesc")}
        >
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: isSeller ? 980 : 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("publish.orderTime")}</TableCell>
                  <TableCell>{t("publish.apartment")}</TableCell>
                  <TableCell>{t("publish.quantity")}</TableCell>
                  <TableCell>{t("publish.note")}</TableCell>
                  {isSeller && <TableCell>{t("publish.delivered")}</TableCell>}
                  {isSeller && <TableCell>{t("publish.paid")}</TableCell>}
                  {isSeller && <TableCell>{t("publish.sellerNoteCol")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {orderList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSeller ? 7 : 4} align="center">
                      {t("publish.noOrders")}
                    </TableCell>
                  </TableRow>
                ) : (
                  orderList.map((order, idx) => (
                    <TableRow key={order.orderId ?? idx} hover>
                      <TableCell>{order.orderedTime}</TableCell>
                      <TableCell>{order.buyer}</TableCell>
                      <TableCell>{order.amount}</TableCell>
                      <TableCell>{order.note}</TableCell>
                      {isSeller && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={Boolean(order.delivered)}
                            onChange={(event) => handleDelivered(idx, event)}
                          />
                        </TableCell>
                      )}
                      {isSeller && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={Boolean(order.getMoney)}
                            onChange={(event) => handleGetMoney(idx, event)}
                          />
                        </TableCell>
                      )}
                      {isSeller && (
                        <TableCell sx={{ minWidth: 220 }}>
                          <TextField
                            size="small"
                            value={order.sellerNote || ""}
                            onChange={(event) =>
                              handleNoteChange(idx, event.target.value)
                            }
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionBlock>
      </Stack>
    </PageContainer>
  );
};

export default SaleEnvPage;
