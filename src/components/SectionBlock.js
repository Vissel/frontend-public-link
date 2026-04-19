import { Stack, Typography } from "@mui/material";
import CardWrapper from "./CardWrapper";

function SectionBlock({
  title,
  description,
  action,
  children,
  sx = {},
  contentSpacing = 3,
}) {
  return (
    <CardWrapper sx={sx}>
      <Stack spacing={contentSpacing}>
        {(title || description || action) && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Stack spacing={0.75}>
              {title && <Typography variant="h4">{title}</Typography>}
              {description && (
                <Typography variant="body1" color="text.secondary">
                  {description}
                </Typography>
              )}
            </Stack>
            {action}
          </Stack>
        )}
        {children}
      </Stack>
    </CardWrapper>
  );
}

export default SectionBlock;
