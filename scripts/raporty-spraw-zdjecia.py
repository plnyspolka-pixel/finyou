"""Zdjęcia do zanonimizowanych raportów spraw — narzędzie lokalne.

python3 scripts/raporty-spraw-zdjecia.py <katalog>

Czyta <katalog>/decyzje.json (z `bun scripts/raporty-spraw.ts decide`):
  • każde PRZYJĘTE zdjęcie: usuwa EXIF (GPS, data, urządzenie), obraca wg
    orientacji, skaluje do maks. 1600 px, zapisuje ponownie jako JPEG
    → <katalog>/zdjecia/<ref>/<nazwa>.jpg,
  • arkusz kontrolny: miniatury WSZYSTKICH kandydatów z decyzją automatu
    → <katalog>/arkusz-kontrolny-zdjec.pdf (do ręcznego przeglądu, nie
    do publikacji — twarze, numery domów, tablice i dokumenty ocenia człowiek).
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

MAX_SIDE = 1600
THUMB = 300
FONT_DIR = Path(__file__).resolve().parent.parent / "src/lib/legal/fonts"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def clean_copy(src: Path, dst: Path) -> Image.Image:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        # Nowy obraz z samych pikseli — bez EXIF, ICC i innych metadanych.
        clean = Image.new("RGB", im.size)
        clean.paste(im)
    dst.parent.mkdir(parents=True, exist_ok=True)
    clean.save(dst, "JPEG", quality=85, optimize=True)
    return clean


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def main() -> None:
    out = Path(sys.argv[1])
    decisions = json.loads((out / "decyzje.json").read_text("utf8"))
    tiles = []
    for case in decisions:
        for p in case["photos"]:
            thumb = None
            src = p.get("source")
            if src and Path(src).exists():
                try:
                    if p["accept"]:
                        dst = out / "zdjecia" / case["ref"] / (Path(p["fileName"]).stem + ".jpg")
                        img = clean_copy(Path(src), dst)
                    else:
                        # Odrzucone: tylko miniatura w arkuszu, bez kopii na dysku.
                        with Image.open(src) as im:
                            img = ImageOps.exif_transpose(im).convert("RGB")
                    thumb = img.copy()
                    thumb.thumbnail((THUMB, THUMB))
                except Exception as e:  # uszkodzony plik
                    p["reason"] = f"{p['reason']} (plik nieczytelny: {e.__class__.__name__})"
            tiles.append((case["ref"], p, thumb))

    cols, cell_w, cell_h, pad = 3, 360, 440, 24
    rows_per_page = 3
    pages = []
    head = 90
    for start in range(0, max(len(tiles), 1), cols * rows_per_page):
        page = Image.new("RGB", (cols * cell_w + 2 * pad, head + rows_per_page * cell_h + pad), "white")
        d = ImageDraw.Draw(page)
        d.rectangle([0, 0, page.width, 60], fill=(10, 16, 48))
        d.text((pad, 16), "Arkusz kontrolny zdjęć — raporty spraw (DO PRZEGLĄDU, NIE PUBLIKOWAĆ)",
               font=font(20, True), fill=(240, 198, 103))
        for i, (ref, p, thumb) in enumerate(tiles[start:start + cols * rows_per_page]):
            x = pad + (i % cols) * cell_w
            y = head + (i // cols) * cell_h
            box = (x, y, x + cell_w - 16, y + THUMB)
            d.rectangle(box, outline=(200, 200, 210))
            if thumb is not None:
                page.paste(thumb, (x + (cell_w - 16 - thumb.width) // 2, y + (THUMB - thumb.height) // 2))
            else:
                d.text((x + 12, y + THUMB // 2 - 10), "brak podglądu", font=font(16), fill=(120, 120, 130))
            ok = p["accept"]
            d.text((x, y + THUMB + 8), f"{ref} · {p['fileName'][:34]}", font=font(14, True), fill=(20, 20, 30))
            d.text((x, y + THUMB + 30), "AUTOMAT: PRZYJĘTE" if ok else "AUTOMAT: ODRZUCONE",
                   font=font(15, True), fill=(20, 130, 60) if ok else (190, 40, 40))
            for j, ln in enumerate(wrap(d, p["reason"], font(13), cell_w - 24)[:4]):
                d.text((x, y + THUMB + 52 + j * 17), ln, font=font(13), fill=(80, 80, 90))
        pages.append(page)
    pages[0].save(out / "arkusz-kontrolny-zdjec.pdf", save_all=True, append_images=pages[1:], resolution=110)
    (out / "decyzje.json").write_text(json.dumps(decisions, ensure_ascii=False, indent=2), "utf8")
    print(f"arkusz: {out / 'arkusz-kontrolny-zdjec.pdf'} · kandydatów: {len(tiles)}")


if __name__ == "__main__":
    main()
