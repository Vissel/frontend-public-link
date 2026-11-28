import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import PickerProvider from "../components/PickerProvider";
import PlanSelectPage from "./PlanSelectPage";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

jest.mock("../components/PaymentInfoPanel", () => () => null);

/**
 * The free plan is one per account and the backend refuses a second one, but a
 * seller should find that out from the card rather than from an error after
 * clicking. These tests pin the greyed-out state and its explanation.
 */

const FREE = { planCode: "p-free", fee: 0, planDay: 5, envCount: 1, description: "", planGroup: "PRODUCT" };
const PAID = { planCode: "p-paid", fee: 15000, planDay: 7, envCount: 1, description: "", planGroup: "PRODUCT" };

const pickPlanState = (freePlanUsed) => ({
    data: {
        state: "PICK_PLAN",
        planPurpose: "PRODUCT",
        // Every account in these tests has already answered the purpose
        // question; the one-time chooser has its own cases below.
        purposeChosen: true,
        freePlanUsed,
        activePlan: null,
        pendingPayment: null,
        contactEmail: "s@example.com",
    },
});

const stubCalls = (freePlanUsed) => {
    pubApi.get.mockImplementation((url) => {
        if (url.includes("sellerPlan/current")) return Promise.resolve(pickPlanState(freePlanUsed));
        return Promise.resolve({ data: { items: [FREE, PAID] } });
    });
};

// The plan cards open the window popup, so a click is followed by the window
// calculation and only then by the purchase.
const WINDOW = { startAt: "2030-01-10T09:00", endAt: "2030-01-17T09:00", planDay: 7 };

const stubPosts = (freePlanUsed) => {
    pubApi.post.mockImplementation((url) => {
        if (url.includes("sellerPlan/window")) return Promise.resolve({ data: WINDOW });
        if (url.includes("sellerPlan/select")) return Promise.resolve(pickPlanState(freePlanUsed));
        return Promise.resolve({ data: null });
    });
};

const renderPage = () =>
    render(
        <PickerProvider>
            <PlanSelectPage />
        </PickerProvider>
    );

const openButtonFor = (priceText) =>
    screen.getAllByRole("button").find((button) => button.textContent?.includes(priceText));

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    // The page reads ?next= from the address bar, so leave it clean after a test
    // that planted one.
    window.history.pushState({}, "", "/");
});

describe("PlanSelectPage free plan", () => {
    it("greys the free card out once the account has used it", async () => {
        stubCalls(true);
        renderPage();

        expect(await screen.findByText("Free plan already used")).toBeInTheDocument();

        const freeCard = openButtonFor("0 VND");
        expect(freeCard).toBeDisabled();
        // The reason has to be readable, not implied by a dimmed card.
        expect(screen.getByText(/One free plan per account/)).toBeInTheDocument();
    });

    it("still offers the paid plan to an account that used the free one", async () => {
        stubCalls(true);
        stubPosts(true);
        renderPage();
        await screen.findByText("Free plan already used");

        const paidCard = openButtonFor("15,000 VND");
        expect(paidCard).toBeEnabled();
        fireEvent.click(paidCard);

        // The card opens the window popup instead of selecting on its own: the
        // start is part of the choice, so the plan is only taken once it is set.
        expect(await screen.findByText(/When should the 15,000 VND plan start/)).toBeInTheDocument();
        // Update stays disabled until the window has actually been calculated.
        await screen.findByDisplayValue("10/01/2030 09:00");
        fireEvent.click(screen.getByRole("button", { name: "Update" }));

        expect(await screen.findByText("Selected")).toBeInTheDocument();
    });

    /**
     * Whatever the seller confirmed in the popup has to reach the order, or the
     * popup would only be decoration.
     */
    it("sends the confirmed start with the purchase", async () => {
        stubCalls(true);
        stubPosts(true);
        renderPage();
        await screen.findByText("Free plan already used");

        fireEvent.click(openButtonFor("15,000 VND"));
        await screen.findByDisplayValue("10/01/2030 09:00");
        fireEvent.click(screen.getByRole("button", { name: "Update" }));
        fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));

        await waitFor(() =>
            expect(pubApi.post).toHaveBeenCalledWith("/api/v1/sellerPlan/select", {
                planCode: "p-paid",
                startAt: "2030-01-10T09:00",
            })
        );
    });

    it("offers the free card with its auto-activation note while unused", async () => {
        stubCalls(false);
        renderPage();

        await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(1));

        expect(screen.queryByText("Free plan already used")).toBeNull();
        expect(screen.getByText(/Activates immediately once selected/)).toBeInTheDocument();
        expect(openButtonFor("0 VND")).toBeEnabled();
    });

    /**
     * Clicking the greyed card must not arm the purchase, or the disabled state
     * would be cosmetic while the "Continue to payment" button still worked.
     */
    it("ignores a click on the used free card", async () => {
        stubCalls(true);
        renderPage();
        await screen.findByText("Free plan already used");

        fireEvent.click(openButtonFor("0 VND"));

        expect(screen.queryByText("Selected")).toBeNull();
        expect(screen.getByRole("button", { name: /Continue to payment/i })).toBeDisabled();
        expect(pubApi.post).not.toHaveBeenCalled();
    });
});

describe("PlanSelectPage purpose choice", () => {
    const unsetPurposeState = () => ({
        data: {
            ...pickPlanState(false).data,
            purposeChosen: false,
        },
    });

    const stubUnsetPurpose = () => {
        pubApi.get.mockImplementation((url) => {
            if (url.includes("sellerPlan/current")) return Promise.resolve(unsetPurposeState());
            return Promise.resolve({ data: { items: [FREE, PAID] } });
        });
    };

    /**
     * The "what will you sell" question moved here from the register form: an
     * account that never answered it sees the choice cards, not the catalog.
     */
    it("asks a new seller what they will sell before any catalog", async () => {
        stubUnsetPurpose();
        renderPage();

        expect(await screen.findByText("What will you sell?")).toBeInTheDocument();
        expect(screen.queryByText("Plans on offer")).toBeNull();
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    /**
     * The choice is stored on the account, and only then the catalog for that
     * group is shown.
     */
    it("stores the choice and then shows the catalog", async () => {
        stubUnsetPurpose();
        pubApi.post.mockResolvedValue(pickPlanState(false));
        renderPage();
        await screen.findByText("What will you sell?");

        fireEvent.click(screen.getByRole("button", { name: /Normal products/i }));

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            "/api/v1/sellerPlan/purpose",
            { planPurpose: "PRODUCT" }
        ));
        expect(await screen.findByText("Plans on offer")).toBeInTheDocument();
    });
});

describe("PlanSelectPage way out", () => {
    it("offers a way home next to the purchase button", async () => {
        stubCalls(true);
        renderPage();
        await screen.findByText("Free plan already used");

        fireEvent.click(screen.getByRole("button", { name: /or go to home/i }));

        // No ?next= on this render, so home is the seller workspace.
        expect(mockNavigate).toHaveBeenCalledWith("/sellerHome");
    });

    /**
     * The visitor who only came to book a yoga class leaves the booking page
     * URL behind when registering; the plan gate has to be able to hand it back
     * instead of dropping them in a workspace they cannot use yet.
     */
    it("returns to the page the visitor left when next is present", async () => {
        window.history.pushState({}, "", "/plans?next=%2Fpublink%3Ftoken%3Dabc");
        stubCalls(true);
        renderPage();
        await screen.findByText("Free plan already used");

        fireEvent.click(screen.getByRole("button", { name: /or go to home/i }));

        expect(mockNavigate).toHaveBeenCalledWith("/publink?token=abc");
    });
});
