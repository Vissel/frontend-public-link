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
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) return;

        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL;
        // Forward all query params to the backend
        const backendUrl = `${apiBaseUrl}/api/v1/publish/link${location.search}`;

        const storedAuth = getStoredAuth();

        const handleResponse = (response) => {
            if (response.status === 400) {
                setError(
                    "The link is invalid or expired. Please check the link and try again."
                );
                return;
            }
            if (response.status === 302 || response.status === 301) {
                // Extract the redirect Location header and resolve against the frontend origin
                const locationHeader = response.headers.get("Location");
                if (locationHeader) {
                    const destination = new URL(locationHeader, window.location.origin);
                    window.location.href = destination.href;
                } else {
                    navigate('/error');
                }
                return;
            }
            // Any other non-redirect status: let browser follow naturally
            window.location.href = backendUrl;
        };

        if (storedAuth.token && !storedAuth.isExpired) {
            fetch(backendUrl, {
                headers: {
                    "Authorization": `Bearer ${storedAuth.token}`,
                },
                redirect: "manual",
            })
                .then(handleResponse)
                .catch(() => {
                    navigate('/error');
                });
        } else {
            // No auth token — still intercept the redirect so the browser
            // navigates to the frontend origin (not the backend origin)
            fetch(backendUrl, {
                redirect: "manual",
            })
                .then(handleResponse)
                .catch(() => {
                    navigate('/error');
                });
        }
    }, [token, location.search]);

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
