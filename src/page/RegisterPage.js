import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { Base64 } from "js-base64";
import api from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const RegisterPage = () => {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const rawQueryParams = new URLSearchParams(location.search);
  const rawName = rawQueryParams.get("name");
  const encodedQuery = location.search.startsWith("?")
    ? location.search.slice(1)
    : location.search;
  const decodedQuery = (() => {
    try {
      return encodedQuery ? Base64.decode(encodedQuery) : "";
    } catch (decodeError) {
      console.error("Register link decode failed:", decodeError);
      return "";
    }
  })();
  const queryParam = new URLSearchParams(decodedQuery);
  const paramValue = queryParam.get("id");
  const usernameParam = queryParam.get("username");
  const reqidParam = queryParam.get("reqid");
  // register
  const [inputUsername, setInputUsername] = useState(usernameParam);
  const [inputPassword, setInputPassword] = useState("");
  const [inputName, setInputName] = useState(rawName || usernameParam);
  const [inputLink, setInputLink] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

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
          const tokenHeader =
            response.headers?.token ||
            response.headers?.authorization?.replace(/^Bearer\s+/i, "");
          if (tokenHeader) {
            localStorage.setItem("token", tokenHeader);
          }
          navigate(`/public/link?token=${response.data}`);
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
    } finally {
      setSubmitting(false);
    }
  };

  const hasRequiredParams = Boolean(paramValue && usernameParam && reqidParam);

  return (
    <PageContainer maxWidth="md">
      <SectionBlock
        title="Đăng ký mật khẩu người bán"
        description="Thiết lập tài khoản người bán bằng biểu mẫu MUI thống nhất cho cả desktop và mobile."
      >
        <Stack spacing={3}>
          {!hasRequiredParams && (
            <Alert severity="error">
              Liên kết đăng ký không hợp lệ hoặc đã thiếu tham số cần thiết.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          <Box component="form" onSubmit={handleRegister}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Tài khoản"
                  type="text"
                  value={inputUsername}
                  required
                  onChange={(event) => setInputUsername(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Mật khẩu"
                  type="password"
                  value={inputPassword}
                  required
                  onChange={(event) => setInputPassword(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Tên"
                  type="text"
                  value={inputName}
                  required
                  disabled={Boolean(rawName)}
                  onChange={(event) => setInputName(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Facebook link / tên hiển thị"
                  type="text"
                  value={inputLink}
                  onChange={(event) => setInputLink(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Sau khi đăng ký thành công, bạn sẽ được chuyển đến trang đặt hàng công khai.
                  </Typography>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={!hasRequiredParams || submitting}
                  >
                    Đăng ký
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Box>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default RegisterPage;
