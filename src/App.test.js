import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import SectionBlock from "./components/SectionBlock";
import theme from "./theme";

test("renders shared section block content", () => {
  render(
    <ThemeProvider theme={theme}>
      <SectionBlock title="Shared Title" description="Shared Description">
        <span>Section body</span>
      </SectionBlock>
    </ThemeProvider>
  );

  expect(screen.getByRole("heading", { name: /shared title/i })).toBeInTheDocument();
  expect(screen.getByText(/section body/i)).toBeInTheDocument();
});
