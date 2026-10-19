"""Erzeugt die App-Symbole in app/icons (benötigt Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ZIEL = Path(__file__).resolve().parent.parent / "app" / "icons"
ZIEL.mkdir(parents=True, exist_ok=True)
BLAU, WEISS, HELL = (40, 70, 168), (255, 255, 255), (227, 232, 248)


def zeichne(groesse, rand=0.0, rund=True):
    s = groesse * 4  # überabtasten für glatte Kanten
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rund:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLAU)
    else:
        d.rectangle([0, 0, s, s], fill=BLAU)
    p = s * (0.2 + rand)  # Innenabstand (maskable: größere Schutzzone)
    w = s - 2 * p
    # Kalenderblatt
    d.rounded_rectangle([p, p + w * 0.08, s - p, s - p], radius=int(w * 0.1), fill=WEISS)
    d.rectangle([p, p + w * 0.08, s - p, p + w * 0.3], fill=HELL)
    for x in (0.3, 0.7):
        d.rounded_rectangle([p + w * x - w * 0.045, p, p + w * x + w * 0.045, p + w * 0.2], radius=int(w * 0.04), fill=WEISS)
    # drei Punkte = Personen, ein Haken
    for i, x in enumerate((0.25, 0.5, 0.75)):
        cx, cy, r = p + w * x, p + w * 0.52, w * 0.07
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLAU if i != 1 else (29, 107, 69))
    d.line([(p + w * 0.3, p + w * 0.78), (p + w * 0.45, p + w * 0.9), (p + w * 0.72, p + w * 0.68)], fill=BLAU, width=int(w * 0.07), joint="curve")
    return img.resize((groesse, groesse), Image.LANCZOS)


zeichne(192).save(ZIEL / "icon-192.png")
zeichne(512).save(ZIEL / "icon-512.png")
zeichne(512, rand=0.1, rund=False).save(ZIEL / "icon-maskable-512.png")
zeichne(180, rund=False).convert("RGB").save(ZIEL / "apple-touch-icon.png")

(ZIEL / "icon.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#2846a8"/>
<rect x="20" y="24.8" width="60" height="55.2" rx="6" fill="#fff"/>
<rect x="20" y="24.8" width="60" height="13.2" fill="#e3e8f8"/>
<rect x="35.3" y="20" width="5.4" height="12" rx="2.4" fill="#fff"/><rect x="59.3" y="20" width="5.4" height="12" rx="2.4" fill="#fff"/>
<circle cx="35" cy="51.2" r="4.2" fill="#2846a8"/><circle cx="50" cy="51.2" r="4.2" fill="#1d6b45"/><circle cx="65" cy="51.2" r="4.2" fill="#2846a8"/>
<path d="M38 66.8 L47 74 L63.2 60.8" fill="none" stroke="#2846a8" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
""", encoding="utf-8")
print("Symbole geschrieben:", sorted(p.name for p in ZIEL.iterdir()))
