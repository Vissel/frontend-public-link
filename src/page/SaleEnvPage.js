// token

import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Button,
  Table,
  Container,
  Row,
  Col,
  Form,
  InputGroup,
  FormLabel,
  Stack,
} from "react-bootstrap";

import api from "../api";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";

const SaleEnvPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParam = new URLSearchParams(location.search);
  const paramValue = queryParam.get("token");
  const { userRole,userName, checkAuthStatus } = useAuth();

  const [isSeller, setIsSeller] = useState(userRole === "Seller");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [orderList, setOrderList] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [apartCode, setApartCode] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");

  const [saleEnv, setSaleEnv] = useState({
    sellerName: "",
    productName: "",
  });

  // const handleChange = (e) => {
  //   setBuyer({ ...buyer, [e.target.name]: e.target.value });
  // };

  const handleOrder = (e) => {
    console.log("Click Order");
    setLoading(true);
    const addNewOrder = async () => {
      try {
        const requestNewOrder = {
          orderedTime: "",
          buyer: buyer,
          token: paramValue,
          amount: amount,
          note: note,
        };
        const resNewOrder = await api.post("/public/order", requestNewOrder);
        if (resNewOrder.status === 200) {
          console.log("Added new order.");
          setOrderList((prevList) => [resNewOrder.data, ...prevList]);
          setBuyer("");
          setAmount(0);
          setNote("");
          tableChange(isSeller, orderList);
        }
      } catch (error) {
        // console.error(error);
        setError(error);
      } finally {
        setLoading(false);
        setError("");
      }
    };

    addNewOrder();
  };

  var [totalAmount, setTotalAmount] = useState(0);
  var [totalOrder, setTotalOrder] = useState(0);
  const tableChange = (checkSeller, orders) => {
    // Sumarize
  if (checkSeller) {
      setTotalAmount(orders.reduce((sum, item) => sum + item.amount, 0));
      setTotalOrder(orders.length);
    }
  };

  useEffect(() => {
    console.log("Sale environment page");
    if (paramValue) {
      setLoading(true);
      // get check authtication
      // checkAuthStatus();
      // setIsSeller(userRole === "Seller");

      // get sale environment and orders
      const fetchData = async () => {
        try {
          console.log("Fetching data");
          const response = await api.get(`/public/link?token=${paramValue}`);
          console.log("Response status:", response.status);
          if (response.status !== 200) {
            console.error(`HTTP error! status: ${response.status}`);
            navigate('/error');
          }
          const result = response.data;
          console.log(result.sellerName);
          console.log(result.productName);
          setSaleEnv({
            sellerName: result.sellerName,
            productName: result.productName,
          });
          setOrderList(result.orders);
          const checkedSeller = result.sellerName === userName && userRole === "Seller";
          // for seller checking
          setIsSeller(checkedSeller)
          tableChange(checkedSeller, result.orders);
        } catch (e) {
          setError(e);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [paramValue, checkAuthStatus, userRole]);

  // Handle delivered
  const handleDelivered = async (index, event) => {
    console.log("handle delivered:" + event.target.checked);
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
      // additional response like link is closed.

      // Update the list immutably
      setOrderList((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, delivered: response.data } : item
        )
      );
    } catch (err) {
      console.error(err);
      alert("Check update failed");
    }
  };
  // Handle get money
  const handleGetMoney = async (index, event) => {
    console.log("handle get money:" + event.target.checked);
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
      // additional response like link is closed.

      // Update the list immutably
      setOrderList((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, getMoney: response.data } : item
        )
      );
    } catch (err) {
      console.error(err);
      alert("Check update failed");
    }
  };

  // handle note
  // Store timers per row to debounce typing
  const noteTimers = useRef({});
  const handleNoteChange = (index, value) => {
    console.log("SellerNote:" + value);
    // Update input immediately for UI
    setOrderList((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, sellerNote: value } : item
      )
    );

    // Clear previous timer if exists
    const id = orderList[index].id;
    clearTimeout(noteTimers.current[id]);

    // Set new debounce timer
    noteTimers.current[id] = setTimeout(() => {
      // Here you can send API with final value
      console.log(`Send API for row ${id} with sellerNote: "${value}"`);
      try {
        const order = orderList[index];
        order.sellerNote = value;
        api.post(`/public/order/note`, order);
        // additional response like link is closed.
      } catch (err) {
        console.error(err);
      }
      // sendSellerNoteUpdate(id, value); // Example API call
    }, 500); // 500ms debounce
  };

  // Export excel file
  const exportToExcel = () => {
    setLoading(true);
    const worksheetData = orderList.map((order) => ({
      "Thời gian order": order.orderedTime,
      "Căn hô": order.buyer,
      "Số lương": order.amount,
      "Order note": order.note,
      Giao: order.delivered ? "Có" : "Chưa",
      "Thu tiền": order.getMoney ? "Có" : "Chưa",
      "Ghi chú": order.sellerNote,
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
      `Thống kê đơn hàng-${saleEnv.sellerName}-${
        saleEnv.productName
      }-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    setLoading(false);
  };

  return (
    <Container className="container mt-5">
      <h1>
        Trang đặt hàng: {saleEnv.productName} của {saleEnv.sellerName}
      </h1>
      <h2>Thông tin đặt hàng:</h2>
      {loading && <p>Loading data...</p>}
      {error && <p>Error: error</p>}
      {/* {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data && (
        <div>
          <h3>Data from Backend:</h3>
         
        </div>
      )} */}

      <Row className="justify-content-start">
        {/* Area 2: Product Info */}
        <Col className="d-flex flex-column align-items-start" xs={6}>
          <InputGroup className="mb-3">
            <InputGroup.Text>Căn hộ</InputGroup.Text>
            <Form.Control
              type="text"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value.toUpperCase())}
              aria-label="apartment"
              aria-describedby="basic-addon2"
            />
          </InputGroup>
        </Col>
        <Col className="d-flex flex-column align-items-start" xs={6}>
          <InputGroup className="mb-3">
            <InputGroup.Text>Số lượng:</InputGroup.Text>
            <Form.Control
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="amount"
              aria-describedby="basic-addon2"
            />
          </InputGroup>
        </Col>
      </Row>
      <Row className="justify-content-start">
        <Col className="d-flex flex-column align-items-start" xs={12}>
          <InputGroup className="mb-12">
            <InputGroup.Text>Ghi chú:</InputGroup.Text>
            <Form.Control
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="apartment"
              aria-describedby="basic-addon2"
            />
            <Button variant="primary" onClick={handleOrder}>
              Đặt
            </Button>
          </InputGroup>
        </Col>
      </Row>
      <Row className="justify-content-start">
        {/* Export Excel: Only for Seller */}
        {isSeller && (
          <Col>
            <Button
              onClick={exportToExcel}
              variant="success"
              className="cus-btn"
            >
              Xuất Excel
            </Button>
          </Col>
        )}
        {isSeller && (
          <Col className="justify-content-center" xs={3}>
            <FormLabel>Total amount: {totalAmount}</FormLabel>
          </Col>
        )}
        {isSeller && (
          <Col className="justify-content-center" xs={3}>
            <FormLabel>Total apartment: {totalOrder}</FormLabel>
          </Col>
        )}
        {/* {isSeller && (
        <Col className="justify-content-center" xs={4}>
          <FormLabel>Total estimated money: 500000000 vnd</FormLabel>
        </Col>
        )} */}
      </Row>
      <Row className="justify-content-start" id="cus-table">
        <Col xs={12}>
          <FormLabel>Thông tin order:</FormLabel>
          <Table striped bordered hover size="sm">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Căn hô</th>
                <th>Số lượng</th>
                <th>Ghi chú</th>
                {isSeller && <th>Giao</th>}
                {isSeller && <th>Thu tiền</th>}
                {isSeller && <th>Ghi chú</th>}
              </tr>
            </thead>
            <tbody>
              {orderList.map((order, idx) => (
                <tr key={idx}>
                  <td>{order.orderedTime}</td>
                  <td>{order.buyer}</td>
                  <td>{order.amount}</td>
                  <td>{order.note}</td>
                  {/* ✅ Role-based columns */}
                  {isSeller && (
                    <>
                      <td>
                        <input
                          type="checkbox"
                          name="delivered"
                          checked={order.delivered}
                          onChange={(event) => handleDelivered(idx, event)}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={order.getMoney}
                          onChange={(event) => handleGetMoney(idx, event)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={order.sellerNote}
                          onChange={(e) =>
                            handleNoteChange(idx, e.target.value)
                          }
                        />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
    </Container>
  );
};

export default SaleEnvPage;
