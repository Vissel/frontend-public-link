import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { pubApi } from "../api";
import YogaSection from "./YogaSection";
import PickerProvider from "./PickerProvider";
import { isoWeekday, todayIso } from "../util/yoga";

jest.mock("../api", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    pubApi: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("../AuthContext", () => ({
    useAuth: () => ({ isAuthenticated: false }),
}));

/**
 * The grid used to open centred on the current hour, so a visitor whose classes
 * sit at 15:00 landed on empty rows and had to scroll to discover them. These
 * tests pin the rule that the viewport opens on the hours holding classes, that
 * seven hour rows are visible, and that a counts refresh never yanks the
 * viewport away from what the visitor is reading.
 */

const ROW_HEIGHT = 64;
const VISIBLE_HOURS = 7;

const occurrence = (overrides = {}) => ({
    classCode: "c-ball",
    date: todayIso(),
    dayOfWeek: isoWeekday(todayIso()),
    startTime: "15:00",
    endTime: "16:00",
    title: "Ball",
    coach: "Shin",
    capacity: 20,
    booked: 0,
    remaining: 20,
    past: false,
    ...overrides,
});

const scrollCalls = [];
const originalScrollTo = Element.prototype.scrollTo;

const stubCalendar = (items) => {
    pubApi.post.mockImplementation((url) => {
        if (url.endsWith("/calendar")) {
            return Promise.resolve({ data: { items, sellerView: false } });
        }
        if (url.endsWith("/classes")) {
            return Promise.resolve({ data: { items: [] } });
        }
        return Promise.resolve({ data: { data: {} } });
    });
    pubApi.get.mockResolvedValue({ data: [] });
};

const gridContainer = () => screen.getByTestId("yoga-grid");

beforeAll(async () => {
    await i18n.changeLanguage("en");
});

beforeEach(() => {
    scrollCalls.length = 0;
    Element.prototype.scrollTo = function scrollTo(options) {
        scrollCalls.push({ element: this, options });
    };
    jest.clearAllMocks();
});

afterEach(() => {
    Element.prototype.scrollTo = originalScrollTo;
});

describe("YogaSection calendar viewport", () => {
    it("opens on the hour holding the next class, one row of context above", async () => {
        stubCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        await screen.findByText("Ball");

        const opening = scrollCalls.find((call) => call.element === gridContainer());
        expect(opening).toBeTruthy();
        expect(opening.options.top).toBe((15 - 1) * ROW_HEIGHT);
        expect(opening.options.behavior).toBe("auto");
    });

    it("shows seven hour rows in the viewport", async () => {
        stubCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        await screen.findByText("Ball");

        expect(window.getComputedStyle(gridContainer()).height)
            .toBe(`${56 + VISIBLE_HOURS * ROW_HEIGHT}px`);
    });

    it("falls back to the current hour when the week holds no classes", async () => {
        stubCalendar([]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        await waitFor(() => expect(scrollCalls.length).toBeGreaterThan(0));

        const expectedRow = Math.max(0, Math.min(24 - VISIBLE_HOURS, new Date().getHours() - 1));
        expect(scrollCalls[0].options.top).toBe(expectedRow * ROW_HEIGHT);
        expect(screen.getByText("No classes in this week yet.")).toBeInTheDocument();
    });

    it("jumps smoothly to the class from the week strip", async () => {
        stubCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        await screen.findByText("Ball");
        scrollCalls.length = 0;

        fireEvent.click(screen.getByRole("button", { name: "Go to this class" }));

        expect(scrollCalls).toHaveLength(1);
        expect(scrollCalls[0].options).toEqual({ top: (15 - 1) * ROW_HEIGHT, behavior: "smooth" });
    });

    it("does not re-focus the viewport when counts refresh in the same week", async () => {
        stubCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        await screen.findByText("Ball");
        const openingCalls = scrollCalls.length;

        fireEvent.click(screen.getByText("Ball"));
        fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Walk In" } });
        fireEvent.click(screen.getByRole("button", { name: "Book" }));

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            expect.stringContaining("/book"),
            expect.objectContaining({ buyerName: "Walk In" })
        ));
        await waitFor(() => expect(screen.queryByRole("button", { name: "Book" })).toBeNull());

        expect(scrollCalls.length).toBe(openingCalls);
    });
});

/**
 * Copying a class duplicates its schedule info onto the seller's chosen dates.
 * The name and coach have to be visible and editable in the dialog, because two
 * classes may now share one time frame and the coach is what tells them apart.
 */
describe("YogaSection copy class", () => {
    const stubSellerCalendar = (items) => {
        pubApi.post.mockImplementation((url) => {
            if (url.endsWith("/calendar")) {
                return Promise.resolve({ data: { items, sellerView: true } });
            }
            if (url.endsWith("/classes")) {
                return Promise.resolve({ data: { items: [] } });
            }
            return Promise.resolve({ data: { data: { created: [{}], failed: [] } } });
        });
        pubApi.get.mockResolvedValue({ data: [] });
    };

    const openCopyDialog = async () => {
        fireEvent.contextMenu(await screen.findByText("Ball"));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Copy class" }));
        return screen.findByLabelText(/^Title/);
    };

    it("sends the edited class name and coach with the targets", async () => {
        stubSellerCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        const titleField = await openCopyDialog();
        // pre-filled from the source class, so the seller can keep or change
        expect(titleField).toHaveValue("Ball");
        expect(screen.getByLabelText(/^Coach/)).toHaveValue("Shin");

        fireEvent.change(titleField, { target: { value: "Ball B" } });
        fireEvent.change(screen.getByLabelText(/^Coach/), { target: { value: "Ben" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "02/01/2030" } });
        fireEvent.click(screen.getByRole("button", { name: "Copy class" }));

        await waitFor(() => expect(pubApi.post).toHaveBeenCalledWith(
            expect.stringContaining("/class/copy"),
            expect.objectContaining({
                classCode: "c-ball",
                title: "Ball B",
                coach: "Ben",
                // the picker hands the backend a plain yyyy-MM-dd date whatever
                // order the visitor typed it in
                targets: [expect.objectContaining({
                    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
                    startTime: "15:00",
                    endTime: "16:00",
                })],
            })
        ));
    });

    it("refuses to copy without a class name", async () => {
        stubSellerCalendar([occurrence()]);
        render(<PickerProvider><YogaSection token="t" /></PickerProvider>);

        const titleField = await openCopyDialog();
        fireEvent.change(titleField, { target: { value: "" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "02/01/2030" } });
        fireEvent.click(screen.getByRole("button", { name: "Copy class" }));

        await screen.findByText("Class title is required.");
        expect(pubApi.post).not.toHaveBeenCalledWith(
            expect.stringContaining("/class/copy"), expect.anything());
    });
});
