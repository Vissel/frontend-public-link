/**
 * Avatar helpers shared by the account menu and the chat console.
 *
 * Images never leave the browser at more than AVATAR_PIXELS on a side, which is
 * what keeps the server-side base64 cap (see UserServiceImpl) generous rather
 * than tight, and keeps a profile row in the tens of kilobytes.
 */

export const AVATAR_PIXELS = 256;

const PALETTE = [
  "#1F5C81",
  "#2E7D32",
  "#8E24AA",
  "#EF6C00",
  "#C62828",
  "#00838F",
  "#4527A0",
  "#AD1457",
];

/** Deterministic chip colour for a name, so a guest looks the same everywhere. */
export const colorFromString = (value) => {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

/** Up to two initials, used when there is no picture. */
export const initialsOf = (value) => {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/[\s_.\-@#]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
};

/**
 * Read an image file and re-encode it as a square JPEG data URL.
 *
 * The source is centre-cropped to a square (cover style) before scaling, so no
 * crop UI is needed: whatever the user picks, the stored image is the middle
 * square of it. Rejects non-images so a wrong file fails here instead of
 * producing a broken picture.
 */
export const resizeToDataUrl = (file, size = AVATAR_PIXELS) =>
  new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("notAnImage"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("readFailed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("decodeFailed"));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const offsetLeft = (image.width - side) / 2;
        const offsetTop = (image.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        // White fill first: JPEG has no alpha, transparent PNGs would go black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
        context.drawImage(image, offsetLeft, offsetTop, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
