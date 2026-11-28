import React from "react";
import { Box, Link } from "@mui/material";

/**
 * Rich-text rendering for chat bubbles.
 *
 * Messages are stored and mirrored to Zalo as plain text, so the "rich" part
 * lives only in this renderer: URLs become single-click links that open in a
 * new tab, and a small markdown subset (**bold**, *italic*, `code`) becomes
 * styled nodes. Everything is built as React elements - never
 * dangerouslySetInnerHTML - so a visitor cannot inject markup or script.
 */

const URL_PATTERN = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/i;
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;

/** Trailing sentence punctuation belongs to the text, not to the link. */
const splitTrailingPunctuation = (raw) => {
    let url = raw;
    let tail = "";
    while (url.length > 0 && ".,;:!?)]}".includes(url[url.length - 1])) {
        tail = url[url.length - 1] + tail;
        url = url.slice(0, -1);
    }
    return [url, tail];
};

const renderUrl = (raw, key) => {
    const [url, tail] = splitTrailingPunctuation(raw);
    if (!url) {
        return raw;
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return (
        <React.Fragment key={key}>
            {/* Single click navigates: a plain anchor in a new tab. */}
            <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ color: "inherit", fontWeight: 600, wordBreak: "break-all" }}
            >
                {url}
            </Link>
            {tail}
        </React.Fragment>
    );
};

const renderInline = (segment, key) => {
    if (segment.length > 4 && segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={key}>{segment.slice(2, -2)}</strong>;
    }
    if (segment.length > 2 && segment.startsWith("`") && segment.endsWith("`")) {
        return (
            <Box
                key={key}
                component="code"
                sx={{
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                    bgcolor: "rgba(0,0,0,0.12)",
                    px: 0.5,
                    borderRadius: 0.5,
                }}
            >
                {segment.slice(1, -1)}
            </Box>
        );
    }
    if (segment.length > 2 && segment.startsWith("*") && segment.endsWith("*")) {
        return <em key={key}>{segment.slice(1, -1)}</em>;
    }
    return segment;
};

/** Turns one plain-text message into renderable nodes (links + styled runs). */
export const renderChatRichText = (text) => {
    if (!text) {
        return null;
    }
    return text.split(URL_PATTERN).map((part, index) => {
        // split() with a capturing group puts the matches on odd indices.
        if (index % 2 === 1) {
            return renderUrl(part, `url-${index}`);
        }
        return part
            .split(INLINE_PATTERN)
            .map((segment, segmentIndex) =>
                segmentIndex % 2 === 1 ? renderInline(segment, `run-${index}-${segmentIndex}`) : segment,
            );
    });
};
