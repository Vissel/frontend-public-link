import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import SelfRegisterPage from "./SelfRegisterPage";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

// The page needs both navigation hooks, and react-router-dom 7 cannot be loaded
// under Jest's resolver, so the module is replaced rather than partially mocked.
const mockNavigate = jest.fn();
let mockNextParam = "";
jest.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
    useSearchParams: () => [{ get: () => mockNextParam }],
    Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

// A plain function rather than jest.fn(): react-scripts turns on resetMocks, which
// would strip a mockImplementation from the factory before every test and leave
// new JSEncrypt() returning nothing.
jest.mock("jsencrypt", () => ({
    __esModule: true,
    default: function JSEncryptMock() {
        return {
            setPublicKey: () => { },
            encrypt: () => "encrypted-password",
        };
    },
}));

/**
 * The purpose choice decides which price list a new account is shown, and the
 * backend will refuse a link whose plan group does not match — so picking wrong
 * costs real money. These tests pin that the question is asked, that it is
 * required, and that the answer actually reaches the server.
 */

const fillRequired = () => {
    // MUI appends the required marker to the rendered label, so every lookup has
    // to be a prefix match rather than the bare field name.
    const values = {
        "^Username": "new.seller",
        "^Full name": "New Seller",
        "^Email": "seller@example.com",
        "^Password": "longenough",
        "^Repeat password": "longenough",
    };
    Object.entries(values).forEach(([pattern, value]) => {
        fireEvent.change(screen.getByLabelText(new RegExp(pattern)), { target: { value } });
    });
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create account" }));

beforeAll(async () => {
    await i18n.changeLanguage("en");
    // Pre-seeded so the page skips the RSA key fetch and stays on the form path.
    window.sessionStorage.setItem("publicKey", "test-public-key");
});

beforeEach(() => {
    jest.clearAllMocks();
    mockNextParam = "";
});

afterAll(() => {
    window.sessionStorage.removeItem("publicKey");
});

describe("SelfRegisterPage plan purpose", () => {
    it("asks a seller what they will sell", async () => {
        render(<SelfRegisterPage />);

        expect(await screen.findByText("What will you sell?")).toBeInTheDocument();
        expect(screen.getByText("Normal products")).toBeInTheDocument();
        expect(screen.getByText("Yoga & badminton booking")).toBeInTheDocument();
    });

    /**
     * A court visitor becomes a BUYER who books, never a plan buyer, so asking
     * them for a purpose would only invite a wrong answer.
     */
    it("does not ask a player arriving from a court page", async () => {
        mockNextParam = "/api/v1/publish/saleUrl?requestUuid=abc";
        render(<SelfRegisterPage />);

        await screen.findByText("Create your player account");
        expect(screen.queryByText("What will you sell?")).toBeNull();
    });

    it("refuses to submit until a purpose is chosen", async () => {
        render(<SelfRegisterPage />);
        await screen.findByText("What will you sell?");

        fillRequired();
        submit();

        expect(
            await screen.findByText(/choose what you will sell/i)
        ).toBeInTheDocument();
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("sends the chosen booking purpose to the server", async () => {
        pubApi.post.mockResolvedValue({ data: {} });
        render(<SelfRegisterPage />);
        await screen.findByText("What will you sell?");

        fillRequired();
        fireEvent.click(screen.getByText("Yoga & badminton booking"));
        submit();

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            "/api/v1/publish/self-register",
            expect.objectContaining({
                username: "new.seller",
                role: "SELLER",
                planPurpose: "BOOKING",
            })
        ));
    });

    it("sends PRODUCT when the normal tiles is chosen", async () => {
        pubApi.post.mockResolvedValue({ data: {} });
        render(<SelfRegisterPage />);
        await screen.findByText("What will you sell?");

        fillRequired();
        fireEvent.click(screen.getByText("Normal products"));
        submit();

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            "/api/v1/publish/self-register",
            expect.objectContaining({ planPurpose: "PRODUCT" })
        ));
    });
});
