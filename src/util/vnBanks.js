/**
 * Vietnamese bank / e-wallet list for the transfer info form.
 *
 * Primary source is the public VietQR directory (short name, full name and
 * logo). When it is unreachable (offline dev, blocked CDN) the bundled
 * static fallback under /data/vn-banks.json is used instead, so the bank
 * selector always has options.
 */
const VIETQR_API = "https://api.vietqr.io/v2/banks";
const LOGO_BASE = "https://img.vietqr.io/image";
const FALLBACK_URL = "/data/vn-banks.json";

const buildLogo = (code) => (code ? `${LOGO_BASE}/${code}.png` : "");

const normalizeFromVietqr = (list) =>
  list
    .filter((entry) => entry && (entry.shortName || entry.name))
    .map((entry) => ({
      code: entry.code || entry.bin,
      shortName: entry.shortName || entry.name,
      fullName: entry.name || entry.shortName,
      logo: entry.logo || buildLogo(entry.code || entry.bin),
      category: (entry.shortName || "").match(/ví|wallet|momo|zalopay|shopeepay|payoo/i)
        ? "EWALLET"
        : "BANK",
    }));

const normalizeFromFallback = (list) =>
  list.map((entry) => ({
    code: entry.code,
    shortName: entry.shortName,
    fullName: entry.fullName,
    logo: buildLogo(entry.code),
    category: entry.category || "BANK",
  }));

let cachedBanks = null;

export const loadVietnameseBanks = async () => {
  if (cachedBanks) {
    return cachedBanks;
  }

  try {
    const response = await fetch(VIETQR_API);
    if (!response.ok) {
      throw new Error(`VietQR directory responded ${response.status}`);
    }
    const payload = await response.json();
    const data = payload?.data;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("VietQR directory returned no banks");
    }
    cachedBanks = normalizeFromVietqr(data);
  } catch (error) {
    console.warn("Falling back to bundled bank list:", error?.message || error);
    const response = await fetch(FALLBACK_URL);
    const payload = await response.json();
    cachedBanks = normalizeFromFallback(payload?.items || []);
  }

  return cachedBanks;
};

export const bankLogoUrl = buildLogo;

export default loadVietnameseBanks;
