from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "brand"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "generated"
OUTPUT.mkdir(parents=True, exist_ok=True)

for name in ("enjoy-logo", "enjoy-logo-light"):
    source = Image.open(ASSETS / f"{name}.png").convert("RGBA")
    artwork = source.crop((0, 0, source.width, 1600))
    artwork = artwork.crop(artwork.getbbox())
    artwork.save(OUTPUT / f"{name}.png")

logo = Image.open(OUTPUT / "enjoy-logo.png").convert("RGBA")
logo.thumbnail((840, 840), Image.Resampling.LANCZOS)
icon = Image.new("RGBA", (1024, 1024))
ImageDraw.Draw(icon).rounded_rectangle((32, 32, 992, 992), radius=208, fill="#f7f7f2")
icon.alpha_composite(logo, ((1024 - logo.width) // 2, (1024 - logo.height) // 2))
icon.save(ASSETS / "app-icon.png")
