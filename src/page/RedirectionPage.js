import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    Alert,
    CircularProgress,
    Stack,
    Typography,
} from "@mui/material";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import { getStoredAuth } from "../authStorage";

const RedirectionPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get("token");
    const reqUuid = queryParams.get("reqUuid");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) return;

        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL;
        // Forward all query params to the backend
        const backendUrl = `${apiBaseUrl}/publiclink/api/v1/publish/link${location.search}`;

        const storedAuth = getStoredAuth();

        const headers = {};
        if (storedAuth.token && !storedAuth.isExpired) {
            headers["Authorization"] = `Bearer ${storedAuth.token}`;
        }

        fetch(backendUrl, { headers })
            .then((response) => {
                if (!response.ok) {
                    if (response.status === 400) {
                        setError(
                            "The link is invalid or expired. Please check the link and try again."
                        );
                        return;
                    }
                    throw new Error(`Unexpected status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!data) return; // error already handled

                if (data.status === "INVALID") {
                    setError(
                        "The link is invalid or expired. Please check the link and try again."
                    );
                    return;
                }

                if (data.status === "REDIRECT" && data.destination) {
                    // Navigate to the frontend route using React Router
                    // The destination is a frontend path like /login?username=x&requestUuid=y
                    navigate(data.destination);
                    return;
                }

                setError("Unexpected response from server.");
            })
            .catch((err) => {
                console.error("Redirect fetch failed:", err);
                setError("Failed to process the link. Please try again.");
            });
    }, [token, reqUuid, location.search, navigate]);

    if (!token) {
        return (
            <PageContainer maxWidth="sm">
                <SectionBlock
                    title="Invalid Request"
                    description="The link is missing required parameters."
                >
                    <Alert severity="error">
                        Missing required parameters. Please check the link and try again.
                    </Alert>
                </SectionBlock>
            </PageContainer>
        );
    }

    if (error) {
        return (
            <PageContainer maxWidth="sm">
                <SectionBlock
                    title="Redirect Failed"
                    description="Unable to process the redirect."
                >
                    <Alert severity="error">{error}</Alert>
                </SectionBlock>
            </PageContainer>
        );
    }

    return (
        <PageContainer maxWidth="sm">
            <SectionBlock
                title="Redirecting..."
                description="Please wait while we process your request."
            >
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        Redirecting, please wait...
                    </Typography>
                </Stack>
            </SectionBlock>
        </PageContainer>
    );
};

export default RedirectionPage;
