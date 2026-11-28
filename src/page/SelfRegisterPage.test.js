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
 * The register form is username + password (name and email optional). The
 * "what will you sell" question moved to the plan screen, so this page must
 * never ask it - and a visitor who arrived from a public sale space signs up
 * as a buyer with no seller steps at all.
 */

/** Only what the form insists on: username and password. */
const fillMinimal = () => {
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "new.seller" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "longenough" } });
    fireEvent.change(screen.getByLabelText(/^Repeat password/), { target: { value: "longenough" } });
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

describe("SelfRegisterPage seller sign-up", () => {
    it("keeps the onboarding steps and asks no purpose question", async () => {
        render(<SelfRegisterPage />);

        // The three-step bar stays on the register page...
        expect(await screen.findByText("Choose plan & transfer")).toBeInTheDocument();
        // ...while the "what will you sell" question moved to the plan screen.
        expect(screen.queryByText("What will you sell?")).toBeNull();
    });

    it("registers with only a username and a password", async () => {
        pubApi.post.mockResolvedValue({ data: {} });
        render(<SelfRegisterPage />);
        await screen.findByText("Choose plan & transfer");

        fillMinimal();
        submit();

        await waitFor(() => expect(pubApi.post).toHaveBeenCalled());
        const payload = pubApi.post.mock.calls[0][1];
        expect(payload).toEqual(expect.objectContaining({
            username: "new.seller",
            name: "",
            email: "",
            role: "SELLER",
        }));
        // The purpose is decided on the plan screen, never here.
        expect(payload.planPurpose).toBeUndefined();
    });
});

describe("SelfRegisterPage player sign-up", () => {
    /**
     * A visitor from a public sale space - a seller's product page, a yoga
     * timetable or a court grid - registers as a buyer: no seller steps, no
     * plan purpose, and after login they go straight back to that page.
     */
    it("registers a /publink visitor as a buyer without the seller steps", async () => {
        mockNextParam = "/publink?token=abc";
        pubApi.post.mockResolvedValue({ data: {} });
        render(<SelfRegisterPage />);

        expect(await screen.findByText("Create your player account")).toBeInTheDocument();
        expect(screen.queryByText("Choose plan & transfer")).toBeNull();

        fillMinimal();
        submit();

        await waitFor(() => expect(pubApi.post).toHaveBeenCalled());
        const payload = pubApi.post.mock.calls[0][1];
        expect(payload.role).toBe("BUYER");
        expect(payload.planPurpose).toBeUndefined();
    });

    it("carries the page the visitor left over to the login screen", async () => {
        mockNextParam = "/publink?token=abc";
        pubApi.post.mockResolvedValue({ data: {} });
        render(<SelfRegisterPage />);
        await screen.findByText("Create your player account");

        fillMinimal();
        submit();

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login", {
            state: expect.objectContaining({ next: "/publink?token=abc" }),
        }));
    });
});

describe("SelfRegisterPage duplicate account", () => {
    const rejectedWith = (field) =>
        pubApi.post.mockRejectedValue({
            response: { status: 409, data: { field, message: "server wording" } },
        });

    /**
     * The backend names the input that clashes (username, then email, then full
     * name). The refusal has to land on that field with wording that says what
     * to change, and the visitor must not be moved on to the login step.
     */
    it("marks the email field and stays on the form", async () => {
        rejectedWith("email");
        render(<SelfRegisterPage />);
        await screen.findByText("Choose plan & transfer");

        fillMinimal();
        submit();

        expect(await screen.findByText(/This email is already registered/i)).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("marks the full name field", async () => {
        rejectedWith("name");
        render(<SelfRegisterPage />);
        await screen.findByText("Choose plan & transfer");

        fillMinimal();
        submit();

        expect(await screen.findByText(/An account with this full name already exists/i)).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
