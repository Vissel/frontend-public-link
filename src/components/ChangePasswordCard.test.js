import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import ChangePasswordCard from "./ChangePasswordCard";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

// A plain function, not jest.fn(): react-scripts turns on resetMocks, which would
// strip a mockImplementation from the factory before every test and leave
// new JSEncrypt() returning nothing. Echoing the input back keeps the assertion
// able to tell the current password from the new one.
jest.mock("jsencrypt", () => ({
    __esModule: true,
    default: function JSEncryptMock() {
        return {
            setPublicKey: () => { },
            encrypt: (value) => `encrypted:${value}`,
        };
    },
}));

/**
 * Own-password change on /self. Nothing about the account is sent: the server
 * takes the username from the caller's JWT, so the browser only carries two
 * encrypted secrets - and the form must refuse to send either until it is
 * internally consistent, then surface the server's reason on the field that
 * caused it.
 */

const CURRENT = "oldsecret123";
const NEXT = "newsecret456";

const field = (name) => screen.getByLabelText(name);

const fill = (current, next, confirm = next) => {
    fireEvent.change(field("Current password"), { target: { value: current } });
    fireEvent.change(field("New password"), { target: { value: next } });
    fireEvent.change(field("Confirm new password"), { target: { value: confirm } });
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Change password" }));

/** Reject like axios does when the account service answers with a status. */
const rejectWith = (status, errorMessage) => {
    pubApi.post.mockRejectedValue({ response: { status, data: { errorMessage } } });
};

beforeAll(async () => {
    await i18n.changeLanguage("en");
    // Pre-seeded so the card skips the RSA key fetch and stays on the form path.
    window.sessionStorage.setItem("publicKey", "test-public-key");
});

beforeEach(() => {
    jest.clearAllMocks();
    pubApi.post.mockResolvedValue({ data: {} });
});

afterAll(() => {
    window.sessionStorage.removeItem("publicKey");
});

describe("ChangePasswordCard", () => {
    it("refuses to send an empty form and asks for the current password", async () => {
        render(<ChangePasswordCard />);

        submit();

        await screen.findByText("Please enter your current password.");
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("rejects a new password shorter than the server's minimum", async () => {
        render(<ChangePasswordCard />);

        fill(CURRENT, "short");

        submit();

        await screen.findByText("The password must be at least 8 characters.");
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("rejects reusing the current password as the new one", async () => {
        render(<ChangePasswordCard />);

        fill(CURRENT, CURRENT);

        submit();

        await screen.findByText("The new password must differ from the current one.");
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("rejects a confirmation that does not match", async () => {
        render(<ChangePasswordCard />);

        fill(CURRENT, NEXT, "different789");

        submit();

        await screen.findByText("The passwords do not match.");
        expect(pubApi.post).not.toHaveBeenCalled();
    });

    it("sends both passwords encrypted, without the username, then clears the form", async () => {
        render(<ChangePasswordCard />);

        fill(CURRENT, NEXT);
        submit();

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            "/api/v1/account/password",
            {
                currentPassword: `encrypted:${CURRENT}`,
                newPassword: `encrypted:${NEXT}`,
            }
        ));
        expect(pubApi.post.mock.calls[0][1]).not.toHaveProperty("username");

        await screen.findByText("Password changed.");
        expect(field("Current password")).toHaveValue("");
        expect(field("New password")).toHaveValue("");
        expect(field("Confirm new password")).toHaveValue("");
    });

    it("puts the server's rejection of the current password back on that field", async () => {
        render(<ChangePasswordCard />);
        rejectWith(403, "Current password is not correct");

        fill(CURRENT, NEXT);
        submit();

        await screen.findByText("Current password is not correct");
        expect(field("Current password")).toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByText("Password changed.")).not.toBeInTheDocument();
    });

    it("puts the server's rejection of the new password on that field", async () => {
        render(<ChangePasswordCard />);
        rejectWith(400, "New password must be at least 8 characters");

        fill(CURRENT, NEXT);
        submit();

        await screen.findByText("New password must be at least 8 characters");
        expect(field("New password")).toHaveAttribute("aria-invalid", "true");
    });

    it("falls back to a general alert when the failure is not a field problem", async () => {
        render(<ChangePasswordCard />);
        rejectWith(502, "Account service is not reachable");

        fill(CURRENT, NEXT);
        submit();

        await screen.findByText("Account service is not reachable");
        expect(screen.queryByText("Password changed.")).not.toBeInTheDocument();
    });

    it("says the change is in flight while the request is pending", async () => {
        let release;
        pubApi.post.mockReturnValue(new Promise((resolve) => {
            release = resolve;
        }));
        render(<ChangePasswordCard />);

        fill(CURRENT, NEXT);
        submit();

        const busy = await screen.findByRole("button", { name: "Changing..." });
        expect(busy).toBeDisabled();

        release({ data: {} });
        await screen.findByText("Password changed.");
    });
});
