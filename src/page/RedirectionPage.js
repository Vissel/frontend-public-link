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
import { pubApi } from "../api";

const RedirectionPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get("token");
    const reqUuid = queryParams.get("reqUuid");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) return;

        pubApi
            .get(`/api/v1/publish/link${location.search}`)
            .then((response) => {
                const data = response.data;

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
                if (err.response && err.response.status === 400) {
                    setError(
                        "The link is invalid or expired. Please check the link and try again."
                    );
                    return;
                }
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
