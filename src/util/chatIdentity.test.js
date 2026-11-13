import { forgetDevice, getDeviceId } from "./chatIdentity";

/**
 * Regression tests for the shared-device half of the cross-account chat leak:
 * one browser used to hand the same device id to every account, so visit
 * counters, fingerprints and (before account-first identity) threads merged.
 * Each identity scope must own its device row; anonymous visitors keep the
 * legacy key so returning customers are not orphaned.
 */
describe("scoped chat device identity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("gives each signed-in account its own device id on one browser", () => {
    const eight = getDeviceId("micro08");
    const nine = getDeviceId("micro09");

    expect(eight).not.toBe(nine);
    expect(getDeviceId("micro08")).toBe(eight);
    expect(getDeviceId("micro09")).toBe(nine);
  });

  it("keeps anonymous visitors on the legacy key for continuity", () => {
    const anon = getDeviceId("");

    expect(localStorage.getItem("publiclink.chat.deviceId")).toBe(anon);
    expect(getDeviceId("")).toBe(anon);
    expect(getDeviceId()).toBe(anon);
  });

  it("persists account device ids under their own scoped key", () => {
    const eight = getDeviceId("micro08");

    expect(localStorage.getItem("publiclink.chat.deviceId.u.micro08")).toBe(eight);
    expect(localStorage.getItem("publiclink.chat.deviceId")).toBeNull();
  });

  it("forgetDevice clears only its own scope", () => {
    const eight = getDeviceId("micro08");
    const anon = getDeviceId("");

    forgetDevice("micro08");

    expect(getDeviceId("micro08")).not.toBe(eight);
    expect(getDeviceId("")).toBe(anon);
  });
});
