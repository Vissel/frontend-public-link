import { act, renderHook } from "@testing-library/react";
import useDelayedClose, { SUCCESS_CLOSE_DELAY_MS } from "./useDelayedClose";

describe("useDelayedClose", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("closes after the delay, never before it", () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useDelayedClose(onClose));

    act(() => {
      result.current.schedule();
    });

    act(() => {
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS - 1);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the handler of the latest render, not the one captured first", () => {
    const stale = jest.fn();
    const latest = jest.fn();
    const { result, rerender } = renderHook(({ onClose }) => useDelayedClose(onClose), {
      initialProps: { onClose: stale },
    });

    act(() => {
      result.current.schedule();
    });
    rerender({ onClose: latest });

    act(() => {
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS);
    });

    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("cancel stops a pending close, as a manual dismissal must", () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useDelayedClose(onClose));

    act(() => {
      result.current.schedule();
      result.current.cancel();
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS * 2);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("scheduling twice keeps a single pending close", () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useDelayedClose(onClose));

    act(() => {
      result.current.schedule();
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS / 2);
      result.current.schedule();
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the timer when the owner unmounts", () => {
    const onClose = jest.fn();
    const { result, unmount } = renderHook(() => useDelayedClose(onClose));

    act(() => {
      result.current.schedule();
    });
    unmount();

    act(() => {
      jest.advanceTimersByTime(SUCCESS_CLOSE_DELAY_MS * 2);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours a per-dialog delay", () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useDelayedClose(onClose, { delay: 200 }));

    act(() => {
      result.current.schedule();
      jest.advanceTimersByTime(199);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
