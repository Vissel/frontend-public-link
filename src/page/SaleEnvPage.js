// token

import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import api from "../api";
import { useAuth } from "../AuthContext";

const SaleEnvPage = () => {
  const location = useLocation();
  const queryParam = new URLSearchParams(location.search);
  const paramValue = queryParam.get("token");
  const { userRole } = useAuth();
  const isSeller = userRole === "Seller";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderList, setOrderList] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [saleEnv, setSaleEnv] = useState({
    sellerName: "",
    productName: "",
  });

  const handleChange = (e) => {
    setBuyer({ ...buyer, [e.target.name]: e.target.value });
  };

  const handleOrder = (e) => {
    console.log("Click Order");
    setLoading(true);
    const addNewOrder = async () => {
      try {
        const requestNewOrder = {
          orderedTime: "",
          buyer: buyer.buyer,
          token: paramValue,
        };
        const resNewOrder = await api.post("/public/order", requestNewOrder);
        if (resNewOrder.status === 200) {
          console.log("Added new order.");
          setOrderList((prevList) => [resNewOrder.data, ...prevList]);
        }
      } catch (error) {
        // console.error(error);
        setError(error);
      } finally {
        setLoading(false);
        setBuyer("");
      }
    };

    addNewOrder();
  };

  useEffect(() => {
    if (paramValue) {
      setLoading(true);
      //
      const fetchData = async () => {
        try {
          const response = await api.get(`/public/link?token=${paramValue}`);
          if (response.status !== 200) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const result = await response.data;
          // setData(result);
          console.log(result.sellerName);
          console.log(result.productName);
          setSaleEnv({
            sellerName: result.sellerName,
            productName: result.productName,
          });
          setOrderList(result.orders);
        } catch (e) {
          setError(e);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [paramValue]);

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
      Order: order.buyer,
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
    <div className="container mt-6">
      <h1>
        Trang đặt hàng: {saleEnv.productName} của {saleEnv.sellerName}
      </h1>
      <h2>Thông tin đặt hàng</h2>
      {loading && <p>Loading data...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data && (
        <div>
          <h3>Data from Backend:</h3>
          {/* <pre>{JSON.stringify(data, null, 2)}</pre> */}
        </div>
      )}

      <div className="row align-items-end">
        {/* Area 2: Product Info */}
        <div className="col-md-6 mb-4">
          <div className="form-group col-mb-2">
            <label>Thông tin order:</label>
            <input
              className="form-control"
              maxLength={250}
              name="buyer"
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="col-md-2 mb-4">
          <button className="btn btn-primary me-2" onClick={handleOrder}>
            Đặt
          </button>
        </div>
      </div>
      <div className="row"></div>
      <div className="row">
        <div className="mb-3 d-flex gap-2">
          {/* ✅ Export Excel: Only for Seller */}
          {isSeller && (
            <button onClick={exportToExcel} className="btn btn-success">
              Xuất Excel
            </button>
          )}
        </div>

        <div className="col-md-10 mb-4">
          <table className="table table-bordered">
            <thead className="table-light">
              <tr>
                <th>Thời gian order</th>
                <th>Order</th>
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
                          className="form-control"
                        />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SaleEnvPage;
