import { Paper } from "@mui/material";

function CardWrapper({ children, sx = {}, ...props }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 3 },
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 4,
        boxShadow: "0 16px 40px rgba(15, 76, 129, 0.08)",
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
}

export default CardWrapper;
