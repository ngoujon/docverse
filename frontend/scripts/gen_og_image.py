"""Genere l'image de partage social (Open Graph / Twitter Card), au format
1200x630 recommande. Reprend le style visuel du favicon (fond #1b1730,
sparkle degrade rose->violet, accents cyan/rose) pour rester coherent avec
l'identite de marque sans dependre d'un outil de design externe.

Usage: python3 scripts/gen_og_image.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (27, 23, 48)  # #1b1730
BG2 = (35, 28, 64)  # legerement plus clair, pour un degrade subtil
PINK = (224, 28, 192)  # #e01cc0
PURPLE = (139, 47, 214)  # #8b2fd6
CYAN = (8, 145, 168)  # #0891a8
WHITE = (245, 243, 250)
MUTED = (176, 168, 196)

OUT = Path(__file__).resolve().parent.parent / "public" / "og-image.png"

FONT_BOLD = "/System/Library/Fonts/SFNS.ttf"
FONT_REGULAR = "/System/Library/Fonts/SFNS.ttf"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        font = ImageFont.truetype(path, size)
        try:
            font.set_variation_by_axes([900])  # weight axis on hand, if variable
        except Exception:
            pass
        return font
    except Exception:
        return ImageFont.load_default()


def vertical_gradient(draw: ImageDraw.ImageDraw, box, top, bottom):
    x0, y0, x1, y1 = box
    height = y1 - y0
    for i in range(height):
        t = i / max(height - 1, 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(x0, y0 + i), (x1, y0 + i)], fill=(r, g, b))


def draw_sparkle(base: Image.Image, cx: int, cy: int, r: int):
    """4-branch sparkle/star, meme forme que le favicon, avec un halo lumineux."""
    layer = Image.new("RGBA", (r * 6, r * 6), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    lcx = lcy = r * 3

    def point(angle_deg, length):
        a = math.radians(angle_deg)
        return (lcx + length * math.sin(a), lcy - length * math.cos(a))

    # Halo (glow) derriere le sparkle
    glow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    outer = [point(0, r * 1.9), point(90, r * 0.55), point(180, r * 1.9), point(270, r * 0.55)]
    gd.polygon(outer, fill=(224, 28, 192, 130))
    glow = glow.filter(ImageFilter.GaussianBlur(r * 0.5))
    layer = Image.alpha_composite(layer, glow)
    ld = ImageDraw.Draw(layer)

    # Etoile pleine, degrade approx pink -> purple via deux polygones superposes
    pts = [point(0, r), point(45, r * 0.28), point(90, r), point(135, r * 0.28),
           point(180, r), point(225, r * 0.28), point(270, r), point(315, r * 0.28)]
    ld.polygon(pts, fill=(224, 28, 192, 255))
    pts2 = [point(180, r), point(225, r * 0.28), point(270, r), point(315, r * 0.28),
            point(0, r), point(45, r * 0.28), point(90, r), point(135, r * 0.28)]
    tint = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tint)
    td.polygon([point(90, r), point(135, r * 0.28), point(180, r)], fill=(139, 47, 214, 220))
    layer = Image.alpha_composite(layer, tint)

    base.alpha_composite(layer, (cx - r * 3, cy - r * 3))


def main():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    vertical_gradient(draw, (0, 0, W, H), BG, BG2)

    # Grille de lignes fines en arriere-plan, evoque le favicon (reseau de noeuds)
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 60
    for x in range(0, W + step, step):
        gd.line([(x, 0), (x, H)], fill=(139, 47, 214, 10), width=1)
    for y in range(0, H + step, step):
        gd.line([(0, y), (W, y)], fill=(139, 47, 214, 10), width=1)
    img.paste(Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB"), (0, 0))

    rgba = img.convert("RGBA")

    # Petits points d'accent (cyan / rose), comme sur le favicon
    dots = ImageDraw.Draw(rgba)
    for (dx, dy, dr, color) in [
        (150, 150, 6, CYAN), (1080, 500, 5, PINK), (1000, 120, 4, CYAN), (110, 470, 5, PINK),
    ]:
        dots.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], fill=color + (255,))

    draw_sparkle(rgba, 160, 315, 70)

    img = rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    title_font = load_font(FONT_BOLD, 92)
    tagline_font = load_font(FONT_REGULAR, 38)

    text_x = 330
    max_text_width = W - text_x - 60
    draw.text((text_x, 210), "Docverse", font=title_font, fill=WHITE)
    draw.text((text_x, 320), "RAG souverain hébergé en France", font=tagline_font, fill=CYAN)

    detail_text = "IA Mistral · OVHcloud · aucune donnée hors Union européenne"
    detail_size = 28
    while detail_size > 16:
        detail_font = load_font(FONT_REGULAR, detail_size)
        if draw.textlength(detail_text, font=detail_font) <= max_text_width:
            break
        detail_size -= 2
    draw.text((text_x, 380), detail_text, font=detail_font, fill=MUTED)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {OUT} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
