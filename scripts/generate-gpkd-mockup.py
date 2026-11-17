#!/usr/bin/env python3
"""
Generates a MOCKUP image of a Vietnamese "Giấy chứng nhận đăng ký doanh nghiệp"
(business registration certificate) in A4 portrait, for UI/design use.

It is intentionally a TEMPLATE, not a forgery:
  * every value that a government authority would fill in is a [bracketed
    placeholder] or an all-zero dummy number,
  * there is no signature, no date of issue and no red round seal,
  * a diagonal "BẢN MẪU - KHÔNG CÓ GIÁ TRỊ PHÁP LÝ" watermark crosses the page.

Usage:
    python3 scripts/generate-gpkd-mockup.py [output.png]
"""

import sys
from PIL import Image, ImageDraw, ImageFont

SUPP = "/System/Library/Fonts/Supplemental"
REGULAR = f"{SUPP}/Times New Roman.ttf"
BOLD = f"{SUPP}/Times New Roman Bold.ttf"
ITALIC = f"{SUPP}/Times New Roman Italic.ttf"
BOLDITALIC = f"{SUPP}/Times New Roman Bold Italic.ttf"

PAGE_W, PAGE_H = 1240, 1754          # A4 @ 150 dpi
MARGIN_X = 110
COL_LABEL_W = 300                    # width of the field-name column
BLACK = (20, 20, 20)
GREY = (110, 110, 110)
RULE = (60, 60, 60)

cache = {}


def font(path, size):
    key = (path, size)
    if key not in cache:
        cache[key] = ImageFont.truetype(path, size)
    return cache[key]


def wrap(draw, text, fnt, max_width):
    """Greedy word wrap; keeps explicit \n."""
    lines = []
    for para in text.split("\n"):
        words = para.split(" ")
        current = ""
        for w in words:
            trial = w if not current else current + " " + w
            if draw.textlength(trial, font=fnt) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = w
        lines.append(current)
    return lines


def draw_field(draw, y, label, value, fnt_label, fnt_value, width):
    """One table row: bold label in the left column, value flowing in the right."""
    label_lines = wrap(draw, label, fnt_label, COL_LABEL_W - 10)
    value_x = MARGIN_X + COL_LABEL_W
    value_width = width - COL_LABEL_W
    value_lines = wrap(draw, value, fnt_value, value_width)
    n = max(len(label_lines), len(value_lines))
    line_h = int(fnt_value.size * 1.42)
    for i in range(n):
        ty = y + i * line_h
        if i < len(label_lines):
            draw.text((MARGIN_X, ty), label_lines[i], font=fnt_label, fill=BLACK)
        if i < len(value_lines):
            draw.text((value_x, ty), value_lines[i], font=fnt_value, fill=BLACK)
    return y + n * line_h


def centered(draw, y, text, fnt, fill=BLACK):
    w = draw.textlength(text, font=fnt)
    draw.text(((PAGE_W - w) / 2, y), text, font=fnt, fill=fill)
    return y + int(fnt.size * 1.35)


def watermark(img):
    """Diagonal repeated watermark, drawn rotated onto an alpha layer."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    wm_font = font(BOLD, 46)
    text = "BẢN MẪU - KHÔNG CÓ GIÁ TRỊ PHÁP LÝ"
    tw = int(d.textlength(text, font=wm_font))
    tile = Image.new("RGBA", (tw + 40, 120), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.text((20, 30), text, font=wm_font, fill=(170, 30, 30, 46))
    tile = tile.rotate(28, expand=True, resample=Image.BICUBIC)
    step_x, step_y = tile.width + 90, tile.height + 70
    for yy in range(-tile.height, PAGE_H + tile.height, step_y):
        for xx in range(-tile.width, PAGE_W + tile.width, step_x):
            layer.paste(tile, (xx, yy), tile)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def build(out_path):
    img = Image.new("RGB", (PAGE_W, PAGE_H), (255, 255, 255))
    d = ImageDraw.Draw(img)

    # ------------------------------------------------------------------ frame
    d.rectangle([36, 36, PAGE_W - 36, PAGE_H - 36], outline=RULE, width=5)
    d.rectangle([50, 50, PAGE_W - 50, PAGE_H - 50], outline=RULE, width=1)

    f_small = font(REGULAR, 19)
    f_label = font(BOLD, 21)
    f_value = font(REGULAR, 21)
    f_italic = font(ITALIC, 20)

    # --------------------------------------------------------------- masthead
    y = 92
    y = centered(d, y, "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM",
                 font(BOLD, 26), BLACK)
    y = centered(d, y, "Độc lập - Tự do - Hạnh phúc",
                 font(BOLDITALIC, 23), BLACK)
    d.line([(PAGE_W / 2 - 150, y + 4), (PAGE_W / 2 + 150, y + 4)], fill=RULE, width=1)
    d.line([(PAGE_W / 2 - 150, y + 8), (PAGE_W / 2 + 150, y + 8)], fill=RULE, width=1)
    y += 30

    # issuing authority (top-left) + document title
    d.text((MARGIN_X, y), "Cơ quan đăng ký kinh doanh cấp tỉnh:",
           font=f_small, fill=GREY)
    d.text((MARGIN_X, y + 26), "Phòng Đăng ký kinh doanh - Sở Kế hoạch và Đầu tư\n"
                              "tỉnh/thành phố [TỈNH/THÀNH PHỐ]",
           font=font(BOLD, 21), fill=BLACK)
    y += 100

    y = centered(d, y, "GIẤY CHỨNG NHẬN ĐĂNG KÝ DOANH NGHIỆP",
                 font(BOLD, 34), BLACK)
    y = centered(d, y, "Công ty trách nhiệm hữu hạn một thành viên",
                 font(ITALIC, 24), BLACK) + 10

    # registration number band
    box_top, box_bot = y, y + 78
    d.rectangle([MARGIN_X, box_top, PAGE_W - MARGIN_X, box_bot], outline=RULE, width=2)
    d.text((MARGIN_X + 22, box_top + 12), "Mã số doanh nghiệp",
           font=font(REGULAR, 19), fill=GREY)
    d.text((MARGIN_X + 22, box_top + 34), "[0000000000]",
           font=font(BOLD, 32), fill=BLACK)
    d.text((PAGE_W - MARGIN_X - 320, box_top + 34), "Mã số thuế\n[00000000000000]",
           font=font(REGULAR, 17), fill=GREY)
    y = box_bot + 34

    # ------------------------------------------------- registered information
    y = centered(d, y, "NỘI DUNG ĐĂNG KÝ DOANH NGHIỆP", font(BOLD, 23), BLACK) + 8
    content_w = (PAGE_W - 2 * MARGIN_X)

    y = draw_field(d, y, "1. Tên doanh nghiệp:",
                   "CÔNG TY TNHH [TÊN ĐẦY ĐỦ VIẾT BẰNG TIẾNG VIỆT]", f_label, f_value, content_w)
    y = draw_field(d, y, "(tên viết tắt)", "[TÊN VIẾT TẮT]", f_italic, f_value, content_w)
    y = draw_field(d, y, "2. Địa chỉ trụ sở chính:",
                   "[Số nhà], [đường/phố], [phường/xã], [quận/huyện], "
                   "[tỉnh/thành phố]", f_label, f_value, content_w)
    y = draw_field(d, y, "Điện thoại / Email / Website:",
                   "[số điện thoại] / [email] / [https://domain]", f_label, f_value, content_w)
    y = draw_field(d, y, "3. Ngành, nghề kinh doanh:",
                   "6201: Lập trình máy vi tính", f_label, f_value, content_w)
    industries = [
        "6202: Tư vấn máy vi tính và quản trị hệ thống máy vi tính",
        "6311: Xử lý dữ liệu, cho thuê và các hoạt động liên quan",
        "6312: Cổng thông tin",
        "5820: Xuất bản phần mềm",
        "6329: Hoạt động dịch vụ công nghệ thông tin và dịch vụ khác liên quan đến máy vi tính",
    ]
    line_h = int(f_value.size * 1.42)
    bullet_x = MARGIN_X + COL_LABEL_W + 22
    bullet_w = content_w - COL_LABEL_W - 34
    for ind in industries:
        for i, ln in enumerate(wrap(d, ind, f_value, bullet_w)):
            ty = y
            d.text((bullet_x + (0 if i == 0 else 20), ty), ln, font=f_value, fill=BLACK)
            if i == 0:
                d.ellipse([bullet_x - 14, ty + 11, bullet_x - 7, ty + 18], fill=BLACK)
            y += line_h
    y += 6
    y = draw_field(d, y, "", "(doanh nghiệp thực hiện theo quy định của pháp luật "
                             "về điều kiện đầu tư kinh doanh)", f_italic, f_value, content_w)
    y = draw_field(d, y, "4. Vốn điều lệ:",
                   "[XXX.XXX.XXX] đồng (Bằng chữ: [................................])",
                   f_label, f_value, content_w)
    y = draw_field(d, y, "5. Người đại diện theo pháp luật:",
                   "Chức danh: Giám đốc / Tổng giám đốc", f_label, f_value, content_w)
    y = draw_field(d, y, "", "[HỌ VÀ TÊN] - Sinh năm: [....] - CCCD/Hộ chiếu: [..........]",
                   f_value, f_value, content_w)
    y = draw_field(d, y, "6. Loại hình doanh nghiệp:",
                   "Công ty TNHH một thành viên (có 01 tổ chức làm chủ sở hữu)",
                   f_label, f_value, content_w)
    y = draw_field(d, y, "Chủ sở hữu:", "[TÊN TỔ CHỨC], mã số doanh nghiệp [0000000000]",
                   f_value, f_value, content_w)

    # ------------------------------------------------------------- footer area
    d.line([(MARGIN_X, y + 4), (PAGE_W - MARGIN_X, y + 4)], fill=RULE, width=1)
    y += 26

    # registration dates span the full width, above the signature block
    d.text((MARGIN_X, y),
           "Đăng ký lần đầu: ngày [..] tháng [..] năm [....]",
           font=f_value, fill=BLACK)
    y += line_h
    d.text((MARGIN_X, y), "Đăng ký thay đổi lần thứ: [..], ngày [..] tháng [..] năm [....]",
           font=f_value, fill=BLACK)
    y += int(line_h * 1.8)

    # right column: issuing authority + empty signature/seal guide
    right_x = PAGE_W - MARGIN_X - 430
    yy = y
    d.text((right_x + 30, yy), "PHÒNG ĐĂNG KÝ KINH DOANH\n"
                              "(ĐĂNG KÝ LẦN ĐẦU)\n"
                              "SỞ KẾ HOẠCH VÀ ĐẦU TƯ\n"
                              "tỉnh/thành phố [TỈNH/THÀNH PHỐ]",
           font=font(BOLD, 20), fill=BLACK)
    yy += 108
    d.text((right_x + 120, yy), "KT. TRƯỞNG PHÒNG\nPHÓ TRƯỞNG PHÒNG",
           font=f_small, fill=BLACK)
    # signature / seal area left empty on purpose (dashed guide only)
    box_top = yy + 46
    d.rectangle([right_x + 60, box_top, right_x + 350, box_top + 150],
                outline=(170, 170, 170), width=1)
    d.text((right_x + 92, box_top + 50), "[chữ ký, họ tên\n và dấu của cơ quan\ncấp]",
           font=font(ITALIC, 17), fill=(170, 170, 170))

    d.text((MARGIN_X, y + 6), "Nơi nhận:\n- Doanh nghiệp;\n- Lưu: VT, PKD.",
           font=font(REGULAR, 18), fill=GREY)

    # ------------------------------------------------------- disclaimer strip
    note_y = PAGE_H - 130
    d.line([(MARGIN_X, note_y - 14), (PAGE_W - MARGIN_X, note_y - 14)],
           fill=(200, 200, 200), width=1)
    d.text((MARGIN_X, note_y),
           "MẪU MINH HOẠ GIAO DIỆN - đây không phải giấy tờ do cơ quan nhà nước cấp.\n"
           "Ảnh dùng để thiết kế hiển thị (footer, trang giới thiệu, luồng xác minh hồ sơ);\n"
           "khi công bố, hãy dùng bản scan Giấy chứng nhận đăng ký doanh nghiệp thật của bạn.",
           font=font(ITALIC, 18), fill=(150, 40, 40))

    img = watermark(img)
    img.save(out_path, "PNG", optimize=True)
    return out_path, img.size


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "public/img/giay-phep-dkkd-sample.png"
    path, size = build(target)
    print(f"wrote {path}  {size[0]}x{size[1]} px (A4 @150dpi)")
