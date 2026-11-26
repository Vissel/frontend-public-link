import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import MorePlanPage from "./MorePlanPage";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

const mockNavigate = jest.fn();
// Replaced wholesale rather than spread over requireActual: this page only needs
// useNavigate, and loading the real package drags in the react-router/dom
// subpath export, which Jest's resolver cannot reach in react-router-dom 7.
jest.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

jest.mock("../AuthContext", () => ({
    useAuth: () => ({ userRole: "seller", username: "seller-1" }),
}));

jest.mock("../components/PaymentInfoPanel", () => () => null);

/**
 * The conversion tab is the one place where a seller can be about to lose money
 * without paying anything, so its arithmetic, its warning text and its
 * no-payment navigation are pinned here rather than trusted to a manual pass.
 */

const PRODUCT_15K = { planUserCode: "pu-15", fee: 15000, planDay: 7, envQuota: 1, usedCount: 0, planState: "ACTIVE", planGroup: "BOOKING", extendDays: null, convertsPlanUserCode: null };
const DEARER_35K = { planCode: "p-35", fee: 35000, planDay: 30, envCount: 5, planGroup: "BOOKING" };
const CHEAPER_5K = { planCode: "p-5", fee: 5000, planDay: 1, envCount: 1, planGroup: "BOOKING" };
const SAME_PRICE = { planCode: "p-same", fee: 15000, planDay: 14, envCount: 1, planGroup: "BOOKING" };

const moreState = (activePlans) => ({
    data: {
        state: "READY",
        planPurpose: "BOOKING",
        remainingQuota: 1,
        coverageEndDate: "2026-12-04",
        contactEmail: "s@example.com",
        activePlans,
        pendingPayment: null,
    },
});

const renderPage = () => render(<MorePlanPage />);

const openConvertTab = async () => {
    renderPage();
    await waitFor(() => expect(pubApi.get).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("tab", { name: "Convert plan" }));
};

const sourcePicker = () => screen.getByRole("combobox", { name: /plan to convert/i });

/**
 * A MUI select is a combobox plus a lazily rendered popup, and it opens on
 * mouseDown rather than click, so the running plan is chosen the way a person
 * chooses it: open it, then click the option.
 */
const chooseSource = async (optionName) => {
    fireEvent.mouseDown(sourcePicker());
    fireEvent.click(await screen.findByRole("option", { name: optionName }));
    // The target fetch resolves after the click; waiting for its spinner to clear
    // keeps that state update inside act instead of after the test moved on.
    await waitFor(() => expect(screen.queryByText("Loading...")).toBeNull());
};

/** Choose the catalog plan to move onto by its card price. */
const pickTarget = async (targetPriceText) => {
    await screen.findByText(targetPriceText);
    fireEvent.click(screen.getByText(targetPriceText));
};

const chooseSourceAndTarget = async (optionName, targetPriceText) => {
    await chooseSource(optionName);
    await pickTarget(targetPriceText);
};

beforeAll(async () => {
    // The project's default language is Vietnamese; these assertions read English.
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    jest.clearAllMocks();
    pubApi.get.mockResolvedValue({ data: { items: [DEARER_35K, CHEAPER_5K, SAME_PRICE] } });
});

describe("MorePlanPage convert tab", () => {
    it("offers only real running plans as a conversion source", async () => {
        const extension = { ...PRODUCT_15K, planUserCode: "pu-ext", extendDays: 5 };
        const spentOrder = { ...PRODUCT_15K, planUserCode: "pu-conv", convertsPlanUserCode: "pu-15" };
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K, extension, spentOrder]) : { data: { items: [DEARER_35K] } }));

        await openConvertTab();
        fireEvent.mouseDown(sourcePicker());

        const options = await screen.findAllByRole("option");
        // Order rows are already spent money; converting one would double-bill.
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent(/15,000 VND/);
    });

    it("shows the difference and opens an order when the new plan is dearer", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [DEARER_35K, CHEAPER_5K] } }));
        pubApi.post.mockResolvedValue({
            data: {
                state: "WAITING_TRANSFER",
                planPurpose: "BOOKING",
                activePlans: [PRODUCT_15K],
                conversionOutcome: { result: "ORDER_CREATED", feeDelta: 20000 },
                pendingPayment: { status: "CREATE", paymentToken: "tok" },
            },
        });

        await openConvertTab();
        await chooseSourceAndTarget(/15,000 VND/, "35,000 VND");

        expect(await screen.findByText(/You pay 20,000 VND more/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Create my order for the difference" }));

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith("/api/v1/sellerPlan/convert", {
            planUserCode: "pu-15",
            targetPlanCode: "p-35",
        }));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    /**
     * The message the request specifically asked to be concrete: a downgrade
     * still happens, and the difference is gone.
     */
    it("warns in plain words that a cheaper target loses the difference", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [DEARER_35K, CHEAPER_5K] } }));

        await openConvertTab();
        await chooseSourceAndTarget(/15,000 VND/, "5,000 VND");

        // 15,000 running plan onto a 5,000 target: the whole 10,000 is forfeited.
        expect(await screen.findByText(/10,000 VND difference is LOST/)).toBeInTheDocument();
        // Accepting has to be an effort, so the button says what is being agreed to.
        expect(screen.getByRole("button", { name: /difference is lost — convert anyway/ })).toBeInTheDocument();
        expect(screen.queryByText(/You pay .* more/)).toBeNull();
    });

    it("treats an equal price as nothing owed, without inventing an amount", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [SAME_PRICE] } }));

        await openConvertTab();
        await chooseSourceAndTarget(/7 day/, "15,000 VND");

        expect(await screen.findByText(/costs the same, so nothing is charged/)).toBeInTheDocument();
    });

    it("sends nothing until the seller accepts a loss", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [CHEAPER_5K] } }));

        await openConvertTab();
        await chooseSourceAndTarget(/15,000 VND/, "5,000 VND");

        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("navigates home without a payment when nothing is owed", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [CHEAPER_5K] } }));
        pubApi.post.mockResolvedValue({
            data: {
                state: "READY",
                planPurpose: "BOOKING",
                activePlans: [{ ...PRODUCT_15K, planDay: 1, envQuota: 1 }],
                conversionOutcome: {
                    result: "NO_PAYMENT",
                    feeDelta: -10000,
                    targetPlanDay: 1,
                    targetEnvCount: 1,
                },
                pendingPayment: null,
            },
        });

        await openConvertTab();
        await chooseSourceAndTarget(/15,000 VND/, "5,000 VND");
        fireEvent.click(screen.getByRole("button", { name: /difference is lost — convert anyway/ }));

        // A conversion is not something to retry, so no order may be created.
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/sellerHome", expect.objectContaining({
            state: expect.objectContaining({ planConverted: expect.objectContaining({ result: "NO_PAYMENT" }) }),
        })));
        expect(pubApi.post).toHaveBeenCalledTimes(1);
    });

    it("shows an empty target list instead of a dead picker", async () => {
        pubApi.get.mockImplementation((url) =>
            Promise.resolve(url.includes("moreState") ? moreState([PRODUCT_15K]) : { data: { items: [] } }));

        await openConvertTab();
        await chooseSource(/15,000 VND/);

        expect(await screen.findByText(/No other plan of this kind is on sale/)).toBeInTheDocument();
    });
});
