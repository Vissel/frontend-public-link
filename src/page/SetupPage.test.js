import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import api from "../api";
import PickerProvider from "../components/PickerProvider";
import SetupPage from "./SetupPage";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

// The real manager talks to the transfer-account API, which has nothing to do
// with the plan start these tests are about.
jest.mock("../components/TransferInfoManager", () => () => null);

/**
 * The admin half of the plan start: one optional start for the bulk Mark paid /
 * Activate actions, and a per-row dialog for a single plan - available both
 * while the order waits for payment and after the plan is running.
 */

const PENDING = {
    planUserCode: "pu-pending",
    username: "seller-1",
    displayName: "Seller One",
    fee: 15000,
    planDay: 7,
    envQuota: 1,
    usedCount: 0,
    planState: "CREATE",
    planGroup: "PRODUCT",
    activeDate: null,
    endedDate: null,
    requestedStartAt: "2030-01-10 09:00:00",
    paymentCode: "pay-1",
    paymentStatus: "CREATE",
    paymentUrl: "/payment?token=tok",
    extendDays: null,
    convertsPlanUserCode: null,
};

const RUNNING = {
    planUserCode: "pu-running",
    username: "seller-2",
    displayName: "Seller Two",
    fee: 20000,
    planDay: 3,
    envQuota: 2,
    usedCount: 0,
    planState: "ACTIVE",
    planGroup: "PRODUCT",
    activeDate: "2030-01-10 09:00:00",
    endedDate: "2030-01-13 09:00:00",
    requestedStartAt: "2030-01-10 09:00:00",
    paymentCode: "pay-2",
    paymentStatus: "PAID",
    paymentUrl: "",
    extendDays: null,
    convertsPlanUserCode: null,
};

const EXTENSION_ORDER = { ...PENDING, planUserCode: "pu-ext", extendDays: 5, requestedStartAt: null };

const stubApi = ({ pending = [PENDING], active = [RUNNING] } = {}) => {
    api.post.mockImplementation((url, body) => {
        if (url.endsWith("/list")) {
            const state = body?.listData?.[0]?.state;
            const items = state === "CREATE" ? pending : active;
            return Promise.resolve({ data: { items, total: items.length } });
        }
        return Promise.resolve({ data: 1 });
    });
};

const renderPage = () =>
    render(
        <PickerProvider>
            <SetupPage />
        </PickerProvider>
    );

const startField = () => screen.getByLabelText("Plan start");

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("SetupPage plan start", () => {
    it("leaves the start empty and marks the order paid without one", async () => {
        stubApi();
        renderPage();

        fireEvent.click(await screen.findByRole("checkbox", { name: "pu-pending" }));
        // Nothing typed: blank means "use the start the seller asked for".
        expect(startField()).toHaveValue("");
        fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith(
                "/publiclink/admin/v1/paymentPlan/payment/markPaid",
                { planUserCodes: ["pu-pending"], note: "Payment confirmed by admin", startAt: null }
            )
        );
    });

    it("sends the start typed next to Mark paid", async () => {
        stubApi();
        renderPage();
        fireEvent.click(await screen.findByRole("checkbox", { name: "pu-pending" }));

        fireEvent.change(startField(), { target: { value: "05/12/2030 09:30" } });
        fireEvent.blur(startField());
        fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith(
                "/publiclink/admin/v1/paymentPlan/payment/markPaid",
                {
                    planUserCodes: ["pu-pending"],
                    note: "Payment confirmed by admin",
                    startAt: "2030-12-05T09:30",
                }
            )
        );
    });

    /**
     * A waiting order: the dialog opens on the start the seller asked for, and
     * saving it is what activation will use.
     */
    it("moves the start of a waiting order through the row action", async () => {
        stubApi();
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Set start" }));

        expect(await screen.findByDisplayValue("10/01/2030 09:00")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save start" }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith("/publiclink/admin/v1/paymentPlan/start", {
                planUserCodes: ["pu-pending"],
                startAt: "2030-01-10T09:00",
            })
        );
    });

    /**
     * A running plan opens on its own start, and the end preview is the start
     * plus the plan length, which is the rule the backend applies.
     */
    it("shows a running plan's window and keeps its length", async () => {
        stubApi();
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Change start" }));

        expect(await screen.findByDisplayValue("10/01/2030 09:00")).toBeInTheDocument();
        // 3-day plan: the end follows the start.
        expect(screen.getByDisplayValue("13/01/2030 09:00")).toBeInTheDocument();
    });

    it("disables the start action on an extension order", async () => {
        stubApi({ pending: [PENDING, EXTENSION_ORDER] });
        renderPage();

        const buttons = await screen.findAllByRole("button", { name: "Set start" });
        expect(buttons).toHaveLength(2);
        // The order buys days on another plan, so it has no window of its own.
        expect(buttons.filter((button) => button.disabled)).toHaveLength(1);
    });
});