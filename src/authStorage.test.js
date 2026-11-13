import { AUTH_STORAGE_KEYS, clearAuthStorage, getStoredAuth, storeAuth } from "./authStorage";

/**
 * Regression tests for the cross-account chat leak root cause: the session used
 * to live in localStorage, which every tab of one browser shares, so a login in
 * a second tab rewrote the first tab's account and its chat thread followed.
 * The session must be per-tab and must never import the legacy global keys.
 */
describe("per-tab auth session", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores the session in sessionStorage, never in localStorage", () => {
    storeAuth({ token: "t8", username: "micro08", userRole: "seller", refreshToken: "r8" });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEYS.username)).toBe("micro08");
    expect(sessionStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe("t8");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.username)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    expect(getStoredAuth().username).toBe("micro08");
    expect(getStoredAuth().isAuthenticated).toBe(true);
  });

  it("purges legacy browser-global keys on login so no stale account survives", () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.username, "micro09");
    localStorage.setItem(AUTH_STORAGE_KEYS.token, "old-token");

    storeAuth({ token: "t8", username: "micro08", userRole: "seller" });

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.username)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    expect(getStoredAuth().username).toBe("micro08");
  });

  it("never reads a legacy localStorage session into a tab", () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, "old-token");
    localStorage.setItem(AUTH_STORAGE_KEYS.username, "micro09");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");

    const stored = getStoredAuth();

    expect(stored.isAuthenticated).toBe(false);
    expect(stored.username).toBe("");
    expect(stored.token).toBe("");
  });

  it("clear removes the tab session and the legacy keys", () => {
    storeAuth({ token: "t8", username: "micro08", userRole: "seller" });
    localStorage.setItem(AUTH_STORAGE_KEYS.token, "old-token");

    clearAuthStorage();

    expect(getStoredAuth().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
  });

  it("keeps the session restorable while a refresh token exists", () => {
    storeAuth({
      token: "t8",
      username: "micro08",
      userRole: "seller",
      refreshToken: "r8",
      loginTime: "1",
    });

    const stored = getStoredAuth();

    expect(stored.isExpired).toBe(false);
    expect(stored.refreshToken).toBe("r8");
  });
});
