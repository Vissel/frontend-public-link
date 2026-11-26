# Video Production Guide (0đ, no person on screen)

How to actually make the two shorts with only free tools and the real app. Everything is **UI-only** - no
actors, no faces. One recording session produces both videos.

## A. Tools (all free)

- **Screen recording:** phone built-in (iOS Control Center / Android) for mobile flow; **OBS** or
  macOS `Cmd+Shift+5` for desktop flow.
- **Editing:** **CapCut** (mobile or desktop) - timeline, auto-captions, text animations, transitions,
  stock SFX.
- **Cards/end-caps:** **Canva Free** (1080x1920 logo + price end-card).
- **Music:** CapCut free library / TikTok Commercial Music Library / YouTube Audio Library (avoid copyright).
- **Optional voiceover:** record your own voice in CapCut, or use CapCut's free text-to-speech (Vietnamese).

## B. Recording the app footage (the only "shoot")

Prepare a clean demo account with 1 product and 1 yoga class so recordings look real.

**For video-1 (product):** record these short clips, 3-6s each, phone screen 9:16:
1. Create product link: open form -> type name + price -> tap **Tạo Link**.
2. The link + QR appear (hold still 2s for a pop animation in CapCut).
3. Buyer opens link -> picks product -> enters name -> **Đặt hàng** -> success check.
4. The **VietQR / tài khoản chuyển khoản** block on the sale page.
5. Orders list growing + **Xuất Excel** tap.

**For video-2 (yoga):**
1. Create Yoga link + add a class (Tên lớp / HLV / Thứ / Giờ / Chỗ).
2. Student opens the weekly calendar -> taps **Đặt** -> **"Đã giữ chỗ"**.
3. The **"Còn lại"** count change + payment mode **Trả từng buổi / Dùng gói**.
4. **"Học viên đã đăng ký"** list + **Xuất Excel**.

**No-person pain shots (both videos):** make the "before" mess with **motion graphics**, not faces -
a CapCut chat-bubble template, or a screen-recording of a scrolling chat list / a scribbled Excel column.

## C. Assembly in CapCut (repeat for each video)

1. New project 9:16 (1080x1920), 30fps. Import clips in storyboard order.
2. Trim each clip to its beat length (see the storyboard time column). Total ~15s.
3. Add **auto-captions** from the voiceover track; style: bold, big, centered-bottom, brand blue `#0f4c81`
   outline, 1-2 words pop.
4. Add the **on-screen text** blocks from the storyboard (Animate -> pop/zoom).
5. Zoom-in on buttons when tapped (keyframe scale 100->120) to guide the eye - this replaces a person.
6. Add SFX at each cut (whoosh/ding/chime) and a background music bed at ~-18db under the voiceover.
7. End with the Canva logo + price + **BẮT ĐẦU NGAY** card for the last ~2s.
8. Export 1080x1920, H.264. Save 3 versions: master, **hook-B re-cut** (swap first 2s), **hook-C re-cut**.

## D. One video -> many platforms (repurposing map)

| Source | TikTok | Facebook Reels | YouTube Shorts | Instagram Reels | Zalo |
|--------|--------|----------------|----------------|-----------------|------|
| video-1 master | ✅ primary | ✅ repost | ✅ repost | ✅ repost | ✅ (compressed) |
| video-1 hook-B cut | ✅ (Day 8) | ✅ | - | ✅ | - |
| video-2 master | ✅ primary | ✅ | ✅ | ✅ | ✅ |
| video-2 hook-B/C cut | ✅ (Day 10/38) | ✅ | - | ✅ | - |

Rules: keep it 9:16, burn captions in (most watch muted), first frame must show the hook text, add the link +
"#publiclink" in every caption (see each video file + `post-templates.md`).

## E. How your `video-scripts.md` was merged

- Kept your 15s, 5-beat arc and the "10.000đ / 3 ngày" close - it was strong.
- Removed the on-camera seller/buyer -> replaced with screen-record + motion graphics (your "no person"
  requirement).
- Split the single generic draft into **two focused shorts** (product + yoga booking) so each demo shows one
  real flow start-to-finish.
- Your idea of "a 10-video series with different angles" now lives as the **A/B hook variants** + the 56-day
  re-cut schedule rather than 10 separate builds (keeps it 0đ and one-day-per-post realistic).

## F. Optional AI upgrade path (still ~0đ, when you want polish)

Copy a scene row into **Sora / Runway / CapCut AI** as a prompt, e.g.:
> "Vertical 9:16, clean screen-recording style UI of a Vietnamese e-commerce app, a glowing QR code popping
> in, blue and white theme, bold Vietnamese caption, smooth zoom, no people, 3 seconds."
Use AI only for transitions/end-caps; keep the **real app** clips for trust.

## G. Auto-rendered promo (already generated for you)

Because no screen-recorder/CapCut was available in this environment, a first ready-to-post version was
rendered programmatically (Python + Pillow + a bundled ffmpeg). It follows the same no-person, UI-panel +
big-Vietnamese-text style and includes a real scannable QR to `share-link.top`.

- **Files:** `video_assets/video-1-product-link.mp4` and `video_assets/video-2-yoga-booking.mp4`
  (1080x1920, 30fps, ~15s, H.264, **silent** - add music in CapCut). Cover stills: `poster-video-1.png`,
  `poster-video-2.png`.
- **Regenerate / tweak:** run `python3 render_promo.py` (deps: `pip install --user imageio imageio-ffmpeg qrcode`).
  Edit the scene text, colors, or timing at the bottom of `render_promo.py` (`build_product()` / `build_yoga()`).
- **Use as-is** for the Day 1 / Day 3 debuts, or as a storyboard animatic to guide a nicer CapCut rebuild with
  real app clips.
