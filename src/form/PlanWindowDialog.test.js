import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import PickerProvider from "../components/PickerProvider";
import PlanWindowDialog from "./PlanWindowDialog";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

/**
 * The popup is the only place a seller decides when their plan starts, and the
 * end is whatever the backend answers. What matters here: the default window is
 * asked for on open, a moved start is recalculated by the same endpoint, and only
 * "Update" hands the window back to the screen that will buy the plan.
 */

const PLAN = { planCode: "p-paid", fee: 15000, planDay: 5, envCount: 1, planGroup: "PRODUCT" };

const DEFAULT_WINDOW = { startAt: "2030-01-10T09:00", endAt: "2030-01-15T09:00", planDay: 5 };
const LATER_WINDOW = { startAt: "2030-02-01T08:30", endAt: "2030-02-06T08:30", planDay: 5 };

const renderDialog = (props = {}) =>
    render(
        <PickerProvider>
            <PlanWindowDialog open plan={PLAN} onApplied={jest.fn()} onClose={jest.fn()} {...props} />
        </PickerProvider>
    );

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("PlanWindowDialog", () => {
    it("asks the backend for the default window when it opens", async () => {
        pubApi.post.mockResolvedValue({ data: DEFAULT_WINDOW });

        renderDialog();

        await waitFor(() =>
            expect(pubApi.post).toHaveBeenCalledWith("/api/v1/sellerPlan/window", { planCode: "p-paid" })
        );
        // Both dates come from the answer, displayed day-first like every picker.
        expect(await screen.findByDisplayValue("10/01/2030 09:00")).toBeInTheDocument();
        expect(screen.getByDisplayValue("15/01/2030 09:00")).toBeInTheDocument();
    });

    it("applies the shown window and closes on Update", async () => {
        pubApi.post.mockResolvedValue({ data: DEFAULT_WINDOW });
        const onApplied = jest.fn();
        const onClose = jest.fn();

        renderDialog({ onApplied, onClose });
        await screen.findByDisplayValue("10/01/2030 09:00");
        fireEvent.click(screen.getByRole("button", { name: "Update" }));

        expect(onApplied).toHaveBeenCalledWith("2030-01-10T09:00", "2030-01-15T09:00");
        expect(onClose).toHaveBeenCalled();
    });

    it("closes without applying when the seller backs out", async () => {
        pubApi.post.mockResolvedValue({ data: DEFAULT_WINDOW });
        const onApplied = jest.fn();
        const onClose = jest.fn();

        renderDialog({ onApplied, onClose });
        await screen.findByDisplayValue("10/01/2030 09:00");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(onClose).toHaveBeenCalled();
        expect(onApplied).not.toHaveBeenCalled();
    });

    /**
     * Dismissing from outside (Escape, and the backdrop that shares the same
     * handler) must drop an edit that was never confirmed.
     */
    it("drops an unconfirmed edit when dismissed from outside", async () => {
        pubApi.post.mockResolvedValueOnce({ data: DEFAULT_WINDOW }).mockResolvedValueOnce({ data: LATER_WINDOW });
        const onApplied = jest.fn();
        const onClose = jest.fn();

        renderDialog({ onApplied, onClose });
        const start = await screen.findByDisplayValue("10/01/2030 09:00");
        fireEvent.change(start, { target: { value: "01/02/2030 08:30" } });
        fireEvent.blur(start);
        await waitFor(() => expect(pubApi.post).toHaveBeenCalledTimes(2));

        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

        expect(onClose).toHaveBeenCalled();
        expect(onApplied).not.toHaveBeenCalled();
    });

    it("recalculates the end when the start moves", async () => {
        pubApi.post.mockResolvedValueOnce({ data: DEFAULT_WINDOW }).mockResolvedValueOnce({ data: LATER_WINDOW });

        renderDialog();
        const start = await screen.findByDisplayValue("10/01/2030 09:00");

        fireEvent.change(start, { target: { value: "01/02/2030 08:30" } });
        fireEvent.blur(start);

        await waitFor(() =>
            expect(pubApi.post).toHaveBeenCalledWith("/api/v1/sellerPlan/window", {
                planCode: "p-paid",
                startAt: "2030-02-01T08:30",
            })
        );
        // The end still comes from the backend, never from local arithmetic.
        expect(await screen.findByDisplayValue("06/02/2030 08:30")).toBeInTheDocument();
    });
});