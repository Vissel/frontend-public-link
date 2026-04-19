import { Container } from "@mui/material";

function PageContainer({ children, maxWidth = "lg", sx = {} }) {
  return (
    <Container
      maxWidth={maxWidth}
      sx={{
        py: { xs: 3, sm: 4, md: 5 },
        ...sx,
      }}
    >
      {children}
    </Container>
  );
}

export default PageContainer;
