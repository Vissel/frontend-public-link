import { fireEvent, render, screen } from "@testing-library/react";
import "../i18n";
import { CountdownChip } from "./CountdownTimer";

/**
 * MUI 7's Chip invokes onClick on every click even for non-clickable chips.
 * A buyer / signed-out viewer gets no onClick, so rendering one used to throw
 * "onClick is not a function" the moment the countdown pill was clicked.
 */
const futureDate = () => new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
const renderChip = (props = {}) => {
    render(<CountdownChip targetDate={futureDate()} {...props} />);
};

// React 19 reports an error thrown inside an event handler as a window error
// event instead of rethrowing, so a click has to be observed through it.
const clickAndCollectErrors = (element) => {
    const errors = [];
    const onError = (event) => errors.push(event.error || event.message);
    window.addEventListener("error", onError);
    try {
        fireEvent.click(element);
    } finally {
        window.removeEventListener("error", onError);
    }
    return errors;
};

describe("CountdownChip", () => {
    it("does nothing when clicked without an onClick handler", () => {
        renderChip();

        expect(screen.queryByRole("button")).toBeNull();
        expect(clickAndCollectErrors(screen.getByText(/^\d+d/))).toEqual([]);
    });

    it("does nothing when a non-function onClick is passed", () => {
        renderChip({ onClick: true });

        expect(clickAndCollectErrors(screen.getByText(/^\d+d/))).toEqual([]);
    });

    it("still opens the editor when an onClick handler is supplied", () => {
        const onClick = jest.fn();
        renderChip({ onClick, title: "edit" });
        const chip = screen.getByRole("button");

        expect(clickAndCollectErrors(chip)).toEqual([]);

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(chip).toHaveAttribute("title", "edit");
    });
});
