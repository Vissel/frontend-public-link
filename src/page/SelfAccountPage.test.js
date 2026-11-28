import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import SelfAccountPage from "./SelfAccountPage";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("../AuthContext", () => ({
    useAuth: () => ({ userRole: "BUYER" }),
}));

// The seller-only blocks are covered by their own suites; this page test only
// needs to know they are not rendered for a buyer.
jest.mock("../components/TransferInfoManager", () => () => null);
jest.mock("../components/YogaPlansManager", () => () => null);

/**
 * The account section of /self: the login name is fixed, the role is not
 * repeated on screen, and an email is validated the same way the server
 * validates it - the field explains a bad address and the save stays out of
 * reach until it is right.
 */

const profile = (overrides = {}) => ({
    username: "micro01",
    name: "Micro One",
    email: "",
    role: "BUYER",
    emailLocked: false,
    ...overrides,
});

const stubLoad = (nextProfile) => {
    pubApi.get.mockImplementation((url) => {
        if (url.endsWith("/self")) return Promise.resolve({ data: nextProfile });
        return Promise.resolve({ data: [] });
    });
    pubApi.post.mockResolvedValue({ data: nextProfile });
};

const saveButton = () => screen.getByRole("button", { name: "Save changes" });

/** Render and wait until the loaded profile has actually reached the fields. */
const renderLoaded = async (nextProfile) => {
    stubLoad(nextProfile);
    render(<SelfAccountPage />);
    await screen.findByDisplayValue(nextProfile.name);
};

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => jest.clearAllMocks());

describe("SelfAccountPage account section", () => {
    it("shows a fixed login name and no role field", async () => {
        await renderLoaded(profile());

        const username = screen.getByLabelText("Username");
        expect(username).toBeDisabled();
        expect(username).toHaveValue("micro01");

        expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
        expect(screen.queryByText("BUYER")).not.toBeInTheDocument();
    });

    it("flags an invalid email and keeps saving out of reach", async () => {
        await renderLoaded(profile());

        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "micro@@example" } });

        await screen.findByText("Please enter a valid email address.");
        expect(saveButton()).toBeDisabled();
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("flags a dot before the at sign the same way the server does", async () => {
        await renderLoaded(profile());

        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "micro.@example.com" } });

        await screen.findByText("Please enter a valid email address.");
        expect(saveButton()).toBeDisabled();
    });

    it("saves a well formed email", async () => {
        await renderLoaded(profile());

        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "micro@example.com" } });
        expect(saveButton()).toBeEnabled();

        fireEvent.click(saveButton());
        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            expect.stringContaining("/profile"),
            { name: "Micro One", email: "micro@example.com" }
        ));
    });

    it("presents an already set email as read-only", async () => {
        await renderLoaded(profile({ email: "micro@example.com", emailLocked: true }));

        const email = screen.getByLabelText("Email");
        expect(email).toBeDisabled();
        expect(email).toHaveValue("micro@example.com");
        expect(screen.getByText("Email is set and cannot be changed.")).toBeInTheDocument();
    });
});
