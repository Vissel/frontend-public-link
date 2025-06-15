// src/LoginPage.js (updated)
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {Base64} from "js-base64";

import { useAuth } from "../AuthContext"; // Import useAuth
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
  const [form, setForm] = useState({
    userId: paramValue,
    username: usernameParam,
    password: "",
    name: usernameParam,
    link: "",
    role: "Seller",
  });
  const [inputUsername, setInputUsername] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [inputName, setInputName] = useState("");
  const [inputLink, setInputLink] = useState("");
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (form.username && form.password) {
        const response = await api.post(
          `/auth/sellerRegister?reqId=${reqidParam}`,
          form
        );

        if (response.status === 200) {
          console.log("Register successful!");
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
        setError("Error setting up the login request.");
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
      <h2>dang ky</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleRegister}>
        {/* ... form inputs ... */}
        <div>
          <label htmlFor="username">Username:</label>
          <input
            type="text"
            id="username"
            value={form.username}
            required
            onChange={(e) => setInputUsername(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            value={form.password}
            onChange={(e) => setInputPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="name">Ten:</label>
          <input
            type="text"
            id="name"
            value={form.name}
            onChange={(e) => setInputName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="name">Facebook's link/name:</label>
          <input
            type="text"
            id="link"
            value={form.link}
            onChange={(e) => setInputLink(e.target.value)}
          />
        </div>
        <button type="submit">Dang ky</button>
      </form>
    </div>
  );
};

export default RegisterPage;
