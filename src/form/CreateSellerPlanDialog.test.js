import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import api from "../api";
import CreateSellerPlanDialog from "./CreateSellerPlanDialog";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
}));

/**
 * Regression tests for the empty catalog bug: the gateway used to answer the
 * authenticated catalog with HTTP 200 and an empty body, and the dialog turned
 * that into a silent "no plans" list. The dialog must now tell a genuinely
 * empty catalog apart from a broken response, and must never report a
 * successful create from an unusable response body.
 */

const catalogItems = [
    { planCode: "plan-free", fee: 0, planDay: 5, envCount: 1, description: "" },
    { planCode: "plan-3k", fee: 3000, planDay: 1, envCount: 1, description: "3,000 VND / 1 day" },
    { planCode: "plan-10k", fee: 10000, planDay: 7, envCount: 1, description: "10,000 VND / 7 days" },
    { planCode: "plan-15k-a", fee: 15000, planDay: 7, envCount: 3, description: "" },
    { planCode: "plan-15k-b", fee: 15000, planDay: 14, envCount: 1, description: "" },
    { planCode: "plan-20k-a", fee: 20000, planDay: 14, envCount: 3, description: "" },
    { planCode: "plan-20k-b", fee: 20000, planDay: 30, envCount: 1, description: "" },
    { planCode: "plan-25k", fee: 25000, planDay: 30, envCount: 3, description: "" },
    { planCode: "plan-30k", fee: 30000, planDay: 30, envCount: 5, description: "" },
];

const createdPlan = { planCode: "plan-new", fee: 5000, planDay: 2, envCount: 1, description: "new" };

const catalogResponse = (items) => ({ data: { items } });

const renderDialog = (props = {}) =>
    render(<CreateSellerPlanDialog open onClose={jest.fn()} users={[]} {...props} />);

const fillNewPlan = (fee, days, links) => {
    fireEvent.change(screen.getByLabelText("Fee (VND)"), { target: { value: String(fee) } });
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: String(days) } });
    fireEvent.change(screen.getByLabelText("Links"), { target: { value: String(links) } });
};

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("CreateSellerPlanDialog catalog", () => {
    it("renders every plan of a well-formed catalog", async () => {
        api.get.mockResolvedValue(catalogResponse(catalogItems));

        renderDialog();

        await waitFor(() => expect(screen.getAllByText(/VND$/)).toHaveLength(catalogItems.length));
        expect(screen.getByText("0 VND")).toBeInTheDocument();
        expect(screen.queryByText("No plan in the catalog yet.")).toBeNull();
    });

    it("shows the empty message only for a genuinely empty catalog", async () => {
        api.get.mockResolvedValue(catalogResponse([]));

        renderDialog();

        expect(await screen.findByText("No plan in the catalog yet.")).toBeInTheDocument();
        expect(screen.queryByText(/invalid/i)).toBeNull();
    });

    it("treats an empty 200 body as a failed load with a retry, not as an empty catalog", async () => {
        // The exact gateway regression: status 200, Content-Length 0.
        api.get.mockResolvedValue({ data: "" });

        renderDialog();

        expect(await screen.findByText("The plan catalog response was invalid. Please retry.")).toBeInTheDocument();
        expect(screen.queryByText("No plan in the catalog yet.")).toBeNull();

        // A successful retry replaces the error with the real list.
        api.get.mockResolvedValue(catalogResponse(catalogItems));
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getAllByText(/VND$/)).toHaveLength(catalogItems.length));
        expect(screen.queryByText(/invalid/i)).toBeNull();
    });

    it("blocks existing-plan submission while the catalog failed to load", async () => {
        api.get.mockResolvedValue({ data: "" });
        const onSuccess = jest.fn();

        renderDialog({ onSuccess });

        await screen.findByText("The plan catalog response was invalid. Please retry.");
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        expect(onSuccess).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });
});

describe("CreateSellerPlanDialog standalone creation", () => {
    const openNewPlanTab = async () => {
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("button", { name: "New plan" }));
    };

    it("creates a catalog plan with no seller and never calls createSellerPlan", async () => {
        api.get.mockResolvedValue(catalogResponse(catalogItems));
        api.post.mockResolvedValue({ data: createdPlan });
        const onSuccess = jest.fn();

        renderDialog({ onSuccess });
        await openNewPlanTab();
        fillNewPlan(5000, 2, 1);
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post.mock.calls[0][0]).toBe("/publiclink/admin/v1/paymentPlan/create");
        expect(onSuccess.mock.calls[0][0]).toEqual({
            createdPlan,
            catalogRefreshFailed: false,
        });
    });

    it("does not report success when the create response cannot be confirmed", async () => {
        api.get.mockResolvedValue(catalogResponse(catalogItems));
        // Empty 200 body on create: the plan may or may not exist server-side.
        api.post.mockResolvedValue({ data: "" });
        const onSuccess = jest.fn();
        const onError = jest.fn();

        renderDialog({ onSuccess, onError });
        await openNewPlanTab();
        fillNewPlan(5000, 2, 1);
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(onError).toHaveBeenCalled());
        expect(onError).toHaveBeenCalledWith(
            "The server did not return a usable plan, so the creation could not be confirmed. Check the Existing plan list before trying again."
        );
        expect(onSuccess).not.toHaveBeenCalled();
        // Never auto-retry a create POST: exactly one create call.
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it("still reports a confirmed creation when only the catalog refresh fails", async () => {
        api.get.mockResolvedValueOnce(catalogResponse(catalogItems));
        api.post.mockResolvedValue({ data: createdPlan });
        // The post-create refresh answers with the empty 200 body.
        api.get.mockResolvedValueOnce({ data: "" });
        const onSuccess = jest.fn();

        renderDialog({ onSuccess });
        await openNewPlanTab();
        fillNewPlan(5000, 2, 1);
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(onSuccess.mock.calls[0][0]).toEqual({
            createdPlan,
            catalogRefreshFailed: true,
        });
        expect(api.post).toHaveBeenCalledTimes(1);
    });
});
