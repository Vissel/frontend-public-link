#!/usr/bin/env python3
"""
Render PublicLink zero-cost promo shorts as real 9:16 mp4 files.
Style: NO person on screen - brand-blue gradient panels, big Vietnamese kinetic text,
simple UI mockup cards, and a REAL scannable QR to share-link.top. Silent (add music in CapCut).

Outputs (into video_assets/):
  video-1-product-link.mp4   + poster-video-1.png
  video-2-yoga-booking.mp4   + poster-video-2.png
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

# ---- config ----------------------------------------------------------------
W, H = 1080, 1920
SS = 1.16                      # supersample headroom for Ken-Burns zoom
FPS = 30
BW, BH = int(W * SS), int(H * SS)

OUT_DIR = os.path.join(os.path.dirname(
    os.path.abspath(__file__)), "video_assets")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

BRAND = (15, 76, 129)          # #0f4c81
BRAND_DARK = (9, 44, 75)
BRAND_LIGHT = (33, 112, 168)
WHITE = (255, 255, 255)
INK = (22, 40, 58)
GREY = (214, 222, 231)
ACCENT = (255, 205, 92)        # warm pill for CTA pop


def font(sz):
    return ImageFont.truetype(FONT_PATH, sz)


def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def gradient_bg():
    top, bot = BRAND_DARK, BRAND_LIGHT
    g = np.zeros((BH, BW, 3), dtype=np.uint8)
    ramp = np.linspace(0, 1, BH)[:, None]
    for c in range(3):
        g[:, :, c] = (top[c] + (bot[c] - top[c]) * ramp).astype(np.uint8)
    img = Image.fromarray(g, "RGB")
    # soft glow circle for depth
    ov = Image.new("L", (BW, BH), 0)
    d = ImageDraw.Draw(ov)
    cx, cy = BW // 2, int(BH * 0.42)
    d.ellipse([cx-560, cy-560, cx+560, cy+560], fill=90)
    ov = ov.filter(ImageFilter.GaussianBlur(180))
    img.paste(Image.new("RGB", (BW, BH), BRAND_LIGHT), (0, 0), ov)
    return img


BG = gradient_bg()


def draw_headed(img, headline, sub=None, hy=0.30):
    d = ImageDraw.Draw(img)
    f_big = font(96)
    lines = wrap(d, headline, f_big, BW - 170)
    lh = 120
    y0 = int(BH * hy)
    for ln in lines:
        w = d.textlength(ln, font=f_big)
        d.text(((BW - w) / 2, y0), ln, font=f_big, fill=WHITE,
               stroke_width=3, stroke_fill=BRAND_DARK)
        y0 += lh
    if sub:
        f_s = font(52)
        for ln in wrap(d, sub, f_s, BW - 190):
            w = d.textlength(ln, font=f_s)
            d.text(((BW - w) / 2, y0 + 18), ln, font=f_s, fill=(226, 238, 248))
            y0 += 66
    return img


def rounded_card(img, box, fill=WHITE, radius=44, outline=None, ow=0):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill,
                        outline=outline, width=ow)
    return d


def pill(d, box, text, fill=BRAND, tcolor=WHITE, fsz=54, radius=None):
    x0, y0, x1, y1 = box
    r = radius if radius else (y1 - y0)
    d.rounded_rectangle(box, radius=r, fill=fill)
    f = font(fsz)
    w = d.textlength(text, font=f)
    d.text(((x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - fsz * 0.62), text,
           font=f, fill=tcolor)


def field_label(d, x, y, label):
    d.text((x, y), label, font=font(38), fill=(120, 134, 150))


def qr_image(data, px=560):
    q = qrcode.QRCode(border=1, box_size=12)
    q.add_data(data)
    q.make(fit=True)
    im = q.make_image(fill_color="#0f4c81", back_color="white").convert("RGB")
    return im.resize((px, px), Image.LANCZOS)

# ---- scene renderers (draw on a fresh SS-size base) ------------------------


def scene_hook(headline, sub):
    img = BG.copy()
    draw_headed(img, headline, sub, hy=0.36)
    return img


def scene_product_form():
    img = BG.copy()
    draw_headed(img, "Tạo link bán hàng",
                "Chỉ 30 giây - không cần code", hy=0.16)
    d = rounded_card(img, [150, 640, BW-150, 1500],
                     radius=60, outline=BRAND_LIGHT, ow=3)
    # field 1
    field_label(d, 210, 720, "Tên sản phẩm")
    d.rounded_rectangle([210, 775, BW-210, 880], radius=22, fill=GREY)
    d.text((240, 800), "Sữa hạt / áo thun /...",
           font=font(36), fill=(150, 160, 172))
    # field 2
    field_label(d, 210, 930, "Giá bán")
    d.rounded_rectangle([210, 985, BW-210, 1090], radius=22, fill=GREY)
    d.text((240, 1010), "150.000 đ", font=font(40), fill=INK)
    # qty
    field_label(d, 210, 1140, "Số lượng có sẵn")
    d.rounded_rectangle([210, 1195, BW-210, 1300], radius=22, fill=GREY)
    d.text((240, 1220), "50", font=font(40), fill=INK)
    # button
    pill(d, [210, 1360, BW-210, 1460], "Tạo Link", fill=BRAND, fsz=52)
    return img


def scene_link_qr():
    img = BG.copy()
    draw_headed(img, "1 Link + 1 Mã QR", "Chia sẻ, dán lên bài bán", hy=0.14)
    d = rounded_card(img, [190, 620, BW-190, 1560], radius=60)
    qr = qr_image("https://share-link.top", px=560)
    img.paste(qr, ((BW - 560)//2, 700))
    d.rounded_rectangle([240, 1310, BW-240, 1400], radius=18, fill=GREY)
    d.text((300, 1330), "https://share-link.top/...",
           font=font(38), fill=(120, 134, 150))
    pill(d, [240, 1440, BW-240, 1520],
         "Sao chép / Chia sẻ", fill=BRAND, fsz=44)
    return img


def scene_money_direct(headline="Tiền về THẲNG tài khoản bạn",
                       sub="Không qua sàn - Không giữ tiền"):
    img = BG.copy()
    draw_headed(img, headline, sub, hy=0.38)
    d = rounded_card(img, [250, 1080, BW-250, 1360],
                     radius=50, fill=(235, 244, 252))
    d.text((320, 1130), "VietQR - STK của bạn", font=font(44), fill=BRAND)
    d.text((320, 1200), "0123 456 789", font=font(56), fill=INK,
           stroke_width=1, stroke_fill=INK)
    d.text((320, 1285), "Ngân hàng • chính chủ",
           font=font(36), fill=(120, 134, 150))
    return img


def scene_cta(price="10.000\u0111 / 3 ng\u00E0y", feats="Kh\u00F4ng website \u2022 Kh\u00F4ng code \u2022 Nhanh g\u1ECDn"):
    img = BG.copy()
    d = ImageDraw.Draw(img)
    # wordmark
    f_logo = font(76)
    t = "PublicLink"
    w = d.textlength(t, font=f_logo)
    d.text(((BW-w)/2, int(BH*0.22)), t, font=f_logo, fill=WHITE,
           stroke_width=2, stroke_fill=BRAND_DARK)
    # kicker
    fk = font(58)
    kt = "CH\u1EC8"
    wk = d.textlength(kt, font=fk)
    d.text(((BW-wk)/2, int(BH*0.33)), kt, font=fk, fill=(226, 238, 248))
    # price auto-fit to one line
    sz = 170
    while sz > 92 and d.textlength(price, font=font(sz)) > BW - 150:
        sz -= 8
    fp = font(sz)
    wp = d.textlength(price, font=fp)
    d.text(((BW-wp)/2, int(BH*0.39)), price, font=fp, fill=ACCENT,
           stroke_width=5, stroke_fill=BRAND_DARK)
    f_s = font(50)
    y = int(BH*0.56)
    for ln in wrap(d, feats, f_s, BW-180):
        ww = d.textlength(ln, font=f_s)
        d.text(((BW-ww)/2, y), ln, font=f_s, fill=(226, 238, 248))
        y += 62
    pill(d, [270, int(BH*0.70), BW-270, int(BH*0.70)+130], "BẮT ĐẦU NGAY \u2192",
         fill=BRAND, fsz=60)
    d.text(((BW - d.textlength("share-link.top", font=font(46)))/2, int(BH*0.82)),
           "share-link.top", font=font(46), fill=WHITE)
    return img


def scene_yoga_calendar():
    img = BG.copy()
    draw_headed(img, "Tạo link lớp yoga",
                "Lịch lặp hằng tuần - 30 giây", hy=0.15)
    d = rounded_card(img, [150, 620, BW-150, 1520],
                     radius=60, outline=BRAND_LIGHT, ow=3)
    days = ["H", "2", "3", "4", "5", "7", "CN"]
    x0, x1 = 210, BW - 210
    cw = (x1 - x0) // 7
    for i, dd in enumerate(days):
        cx = x0 + i*cw
        d.rounded_rectangle([cx+4, 680, cx+cw-4, 760],
                            radius=14, fill=(228, 238, 248))
        d.text((cx + cw//2 - 12, 692), dd, font=font(40), fill=BRAND)
    # a couple of class rows
    rows = [("Sáng 6:00", "9 chỗ"), ("Chiều 18:30",
                                     "12 chỗ"), ("Tối 20:00", "8 chỗ")]
    yy = 820
    for r in rows:
        d.rounded_rectangle([x0, yy, x1, yy+180], radius=22, fill=(245, 249, 253),
                            outline=(214, 222, 231), width=2)
        d.text((x0+30, yy+22), r[0], font=font(46), fill=BRAND)
        d.text((x0+30, yy+96), "HLV Hương \u2022 " +
               r[1], font=font(38), fill=(120, 134, 150))
        pill(d, [x1-190, yy+40, x1-30, yy+130], "Xem", fill=BRAND, fsz=36)
        yy += 210
    return img


def scene_yoga_book():
    img = BG.copy()
    draw_headed(img, "Học viên tự \u0110\u1EB7t ch\u1ED7",
                "Mở link \u2192 bấm \u201C\u0110\u1EB7t\u201D", hy=0.15)
    d = rounded_card(img, [150, 620, BW-150, 1520],
                     radius=60, outline=BRAND_LIGHT, ow=3)
    d.text((210, 690), "Th\u1EE9 3 \u2022 S\u00E1ng 6:00 \u2022 HLV H\u01B0\u01A1ng",
           font=font(46), fill=BRAND)
    d.text((210, 760), "Yoga c\u01A1 b\u1EA3n", font=font(56), fill=INK,
           stroke_width=1, stroke_fill=INK)
    # remaining counter big
    d.text((210, 880), "C\u00F2n l\u1EA1i",
           font=font(44), fill=(120, 134, 150))
    d.text((210, 940), "8 \u2192 7", font=font(150), fill=BRAND,
           stroke_width=3, stroke_fill=BRAND_DARK)
    # payment modes
    d.rounded_rectangle([210, 1180, BW-210, 1270], radius=18, fill=GREY)
    d.text((250, 1200), "\u25CF Tr\u1EA3 t\u1EEBng bu\u1ED5i",
           font=font(40), fill=INK)
    d.rounded_rectangle([210, 1300, BW-210, 1390],
                        radius=18, fill=(228, 238, 248))
    d.text((250, 1320), "\u25CB D\u00F9ng g\u00F3i thanh to\u00E1n",
           font=font(40), fill=INK)
    pill(d, [210, 1430, BW-210, 1510],
         "\u0110\u1EB6t gi\u1EEF ch\u1ED7", fill=BRAND, fsz=46)
    return img

# ---- assembly --------------------------------------------------------------


def crop_zoom(base, z, panx=0.0, pany=0.0):
    win_w, win_h = int(BW / z), int(BH / z)
    cx = BW / 2 + panx * (BW - win_w) / 2
    cy = BH / 2 + pany * (BH - win_h) / 2
    x0 = int(max(0, min(BW - win_w, cx - win_w / 2)))
    y0 = int(max(0, min(BH - win_h, cy - win_h / 2)))
    return base.crop((x0, y0, x0 + win_w, y0 + win_h)).resize((W, H), Image.LANCZOS)


def to_np(im):
    return np.asarray(im, dtype=np.uint8)


BG_DIPS = Image.new("RGB", (W, H), BRAND_DARK)


def build_video(scenes, out_path, poster_path):
    import imageio.v2 as imageio
    writer = imageio.get_writer(out_path, fps=FPS, codec="libx264",
                                pixelformat="yuv420p",
                                macro_block_size=None,
                                ffmpeg_params=["-crf", "20", "-preset", "medium"])
    dip = int(round(0.18 * FPS))  # frames of dip-to-black per edge
    first_frame = None
    for si, (base, dur, z0, z1, pan) in enumerate(scenes):
        n = int(round(dur * FPS))
        for f in range(n):
            t = f / max(1, n - 1)
            z = z0 + (z1 - z0) * t
            frame = crop_zoom(base, z, pan[0], pan[1] * t)
            # dip transitions at scene edges
            if f < dip and si > 0:
                frame = Image.blend(BG_DIPS, frame, (f / dip) ** 0.7)
            elif f >= n - dip and si < len(scenes) - 1:
                a = (n - 1 - f) / dip
                frame = Image.blend(BG_DIPS, frame, (a) ** 0.7)
            arr = to_np(frame)
            if first_frame is None:
                first_frame = arr.copy()
            writer.append_data(arr)
    writer.close()
    Image.fromarray(first_frame).save(poster_path)
    print("wrote", out_path)

# scene tuple: (base_image, duration_s, zoom_start, zoom_end, (panx, pany))


def build_product():
    sc = [
        (scene_hook("B\u00E1n h\u00E0ng m\u00E0 tr\u1EA3 l\u1EDDi tin nh\u1EAFn c\u1EA3 ng\u00E0y?",
         "M\u1EC7t v\u00EC ch\u00F3t \u0111\u01A1n th\u1EE7 c\u00F4ng?"), 3.0, 1.02, 1.14, (0, 0)),
        (scene_product_form(), 3.0, 1.14, 1.02, (0.0, 0.0)),
        (scene_link_qr(), 3.0, 1.02, 1.12, (0, 0)),
        (scene_money_direct(), 3.0, 1.12, 1.02, (0, 0)),
        (scene_cta(), 3.2, 1.02, 1.16, (0, 0)),
    ]
    build_video(sc, os.path.join(OUT_DIR, "video-1-product-link.mp4"),
                os.path.join(OUT_DIR, "poster-video-1.png"))


def build_yoga():
    sc = [
        (scene_hook("L\u1EDBp yoga qu\u1EA3n l\u00FD b\u1EB1ng tin nh\u1EAFn + Excel?",
         "Tr\u00F9ng gi\u1EDD, qu\u00EAn ai ch\u01B0a chuy\u1EC3n kho\u1EA3n"), 3.0, 1.02, 1.14, (0, 0)),
        (scene_yoga_calendar(), 3.2, 1.14, 1.02, (0.0, 0.0)),
        (scene_yoga_book(), 3.2, 1.02, 1.12, (0, 0)),
        (scene_money_direct("Ti\u1EC1n v\u1EC1 TH\u1EAENG t\u00E0i kho\u1EA3n b\u1EA1n",
         "Tr\u1EA3 t\u1EEBng bu\u1ED5i ho\u1E63c d\u00F9ng g\u00F3i"), 2.8, 1.12, 1.02, (0, 0)),
        (scene_cta(), 3.2, 1.02, 1.16, (0, 0)),
    ]
    build_video(sc, os.path.join(OUT_DIR, "video-2-yoga-booking.mp4"),
                os.path.join(OUT_DIR, "poster-video-2.png"))


if __name__ == "__main__":
    print("Output dir:", OUT_DIR)
    build_product()
    build_yoga()
    print("DONE")
