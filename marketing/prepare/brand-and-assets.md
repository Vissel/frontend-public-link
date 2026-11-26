# Brand Kit & Reusable Assets

Everything here is copy-paste ready. Keep the visual language consistent with the app (see `theme.js`).

## Core identity

- **Name:** PublicLink (also "Public link" / "Liên kết công khai")
- **Domain / product URL:** `https://share-link.top`
- **Primary color:** soft blue `#0f4c81`
- **Style tokens (match the app):** rounded corners (radius 16), pill buttons, soft shadows, light gradient
  background. Use **blue + white** for a professional, trustworthy feel.
- **Contact:** `nguyenjade916@gmail.com`
- **Logo:** use the app logo (`public/img/logo.jpeg` / `icon.png`). Do not recolor it.

## Taglines (rotate)

- Tạo 1 link. Nhận đơn / giữ chỗ.
- Bán hàng không cần website, không cần trả lời tin nhắn cả ngày.
- Khách quét mã - tiền về thẳng tài khoản bạn.
- 30 giây có link bán hàng + mã QR.
- Chỉ 10.000đ / 3 ngày.

## Standard CTA block (append to posts that want a click)

```
👉 Tạo link miễn phí: https://share-link.top
Chỉ 10.000đ / 3 ngày • Không cần website • Không cần code
```

## Hashtag sets (Vietnamese)

- **Product sellers:** `#banhangonline #khoidaimac #mebimsua #shoponline #qrthanh toán #linkbanhang #publiclink`
- **Yoga / classes:** `#yogavietnam #lop yoga #datlop #yogahanoi #yogahcm #giamcankhoe #publiclink`
- **General / reach:** `#startup #hocbanhang #kinhdoanhonline #tiktokshop #facebookmarket`
- Rule: 3-5 hashtags TikTok, up to 8-10 Facebook; always include `#publiclink`.

## Link + tracking (UTM)

Append UTM to every shared `share-link.top` link so GA4 can attribute the source. Template:

```
https://share-link.top/?utm_source=<platform>&utm_medium=organic&utm_campaign=<phase>&utm_content=<dayN>
```

Examples:
- TikTok Day 1: `...?utm_source=tiktok&utm_medium=organic&utm_campaign=awareness&utm_content=day1`
- Group seed: `...utm_source=fbgroup&utm_medium=organic&utm_campaign=awareness`
- Powered-by referral: `...utm_source=publiclink&utm_medium=poweredby&utm_campaign=referral`

**GA4 (free) - one-time setup:** create property -> add the site tag to `public/index.html` (or via the
existing analytics snippet) -> define a key event for "register started" and "first link created" if the
backend can fire them; otherwise track `share-link.top` landing sessions and sign-ups by UTM.

## Reusable image specs (Canva Free)

- Thumbnail / quote card: **1080x1080** (FB/IG feed), background `#0f4c81` or white, big Vietnamese text.
- Story/Reel cover: **1080x1920** (9:16).
- Comparison graphic: two columns "Qua tin nhắn" vs "PublicLink", check/cross, blue accents.

## Voice & tone (Vietnamese)

- Speak like a savvy friend who sells online - plain, warm, direct, no corporate jargon.
- Use "bạn" for the seller, address the pain first, then the fix, then one CTA.
- Short sentences. Numbers concrete (30 giây, 10.000đ, 3 ngày). Emoji sparingly (1-3 per post).
