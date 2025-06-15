// src/LoginPage.js (updated)
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Base64 } from "js-base64";

import api from "../api";

const RegisterPage = () => {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const queryParam = new URLSearchParams(Base64.decode(location.search));
  const paramValue = queryParam.get("id");
  const usernameParam = queryParam.get("username");
  const reqidParam = queryParam.get("reqid");
  // register
  const [inputUsername, setInputUsername] = useState(usernameParam);
  const [inputPassword, setInputPassword] = useState("");
  const [inputName, setInputName] = useState(usernameParam);
  const [inputLink, setInputLink] = useState("");
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (inputUsername && inputPassword) {
        const form = {
          userId: paramValue,
          userName: inputUsername,
          password: inputPassword,
          name: inputName,
          link: inputLink,
          role: "SELLER",
        };
        localStorage.clear();
        const response = await api.post(
          `/auth/sellerRegister?reqId=${reqidParam}`,
          form
        );

        if (response.status === 200) {
          console.log("Register successful!");
          // console.log(response.header.get("token"));
          // get token in header response, set to local storage.
          localStorage.setItem("token", response.headers.get("token"));
          // get response public link.
          alert("Register successful!");
          navigate(`/public/link?token=${response.data}`); // Navigate after state is updated
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.response) {
        if (err.response.data && err.response.data.message) {
          setError(err.response.data.message);
        } else if (err.response.status === 401 || err.response.status === 403) {
          setError("Wrong username/password");
        } else {
          setError("An unexpected error occurred during login.");
        }
      } else if (err.request) {
        setError(
          "No response from server. Please check your network connection."
        );
      } else {
        setError("Error setting up the register request.");
      }
    }
  };

  //   useEffect(() => {
  //       if (paramValue) {
  //         setLoading(true);
  //         const fetchData = async () => {
  //         try {
  //           const response = await api.get(`/public/register?id=${paramValue}`);
  //           if (response.status !== 200) {
  //             throw new Error(`HTTP error! status: ${response.status}`);
  //           }
  //           const result = await response.data;
  //           // setData(result);
  //           console.log(result.sellerName);
  //           console.log(result.productName);
  //           setSaleEnv({
  //             sellerName: result.sellerName,
  //             productName: result.productName,
  //           });
  //           setOrderList(result.orders);
  //         } catch (e) {
  //           setError(e);
  //         } finally {
  //           setLoading(false);
  //         }
  //       };

  //       }
  //         }, [paramValue]);
  return (
    <div className="container mt-6">
      <h2>Đăng ký mật khẩu người bán</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div className="row text-start align-items-start">
        <form onSubmit={handleRegister}>
          {/* ... form inputs ... */}
          <div className="row justify-content-md">
            <div className="col col-lg-2">
              <label htmlFor="username">Tài khoản:</label>
            </div>
            <div className="col col-lg-4">
              <input
                type="text"
                id="inputUsername"
                value={inputUsername}
                required
                onChange={(e) => setInputUsername(e.target.value)}
              />
            </div>
          </div>
          <div className="row justify-content-md">
            <div className="col col-lg-2">
              <label htmlFor="password">Mât khẩu:</label>
            </div>
            <div className="col col-lg-6">
              <input
                type="password"
                id="inputPassword"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="row justify-content-md">
            <div className="col col-lg-2">
              <label htmlFor="name">Tên:</label>
            </div>
            <div className="col col-lg-6">
              <input
                type="text"
                id="inputName"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
              />
            </div>
          </div>
          <div className="row justify-content-md">
            <div className="col col-lg-2">
              <label htmlFor="name">Facebook's link/name:</label>
            </div>
            <div className="col col-lg-6">
              <input
                type="text"
                id="inputLink"
                value={inputLink}
                onChange={(e) => setInputLink(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <div className="col col-lg-2">
          <button type="submit" className="btn btn-primary">
            Đăng ký
          </button></div></div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
