#!/usr/bin/env python3
"""
Извлекает каталог (товары, цены, объёмы, артикулы) и фотографии из PDF-прайса
«Посудная лавка» и раскладывает их в data/catalog.json + webapp/assets/products/.

Запуск:  python3 scripts/build_catalog.py PL_avgust_2026.pdf
Зависимости: pymupdf, pillow, numpy
"""
import io
import json
import math
import os
import re
import sys

import numpy as np
import pymupdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "PL_avgust_2026.pdf")
IMG_DIR = os.path.join(ROOT, "webapp", "assets", "products")
DATA_DIR = os.path.join(ROOT, "data")

# страница PDF -> категория
PAGE_CATEGORY = {
    2: "highball", 3: "highball",
    4: "oldfashioned", 5: "oldfashioned", 6: "oldfashioned",
    7: "cocktail", 8: "cocktail", 9: "cocktail", 10: "cocktail", 11: "cocktail", 12: "cocktail",
    13: "wine", 14: "wine", 15: "wine",
    16: "decanter", 17: "tea", 18: "giftbox",
}

CATEGORIES = [
    {"id": "highball", "title": "Хайболы", "subtitle": "Long drink", "emoji": "🥤"},
    {"id": "oldfashioned", "title": "Олд фешн", "subtitle": "Rocks / tumbler", "emoji": "🥃"},
    {"id": "cocktail", "title": "Коктейльные", "subtitle": "Cocktail glasses", "emoji": "🍸"},
    {"id": "wine", "title": "Винные", "subtitle": "Wine glasses", "emoji": "🍷"},
    {"id": "decanter", "title": "Графины", "subtitle": "Decanters", "emoji": "🫗"},
    {"id": "tea", "title": "Чайная коллекция", "subtitle": "Tea collection", "emoji": "🫖"},
    {"id": "giftbox", "title": "Подарочные наборы", "subtitle": "Gift box", "emoji": "🎁"},
]

# названия, которые в PDF разбиты на несколько текстовых блоков
NAME_FIX = {
    "032": "Levitas Highball",
    "033": "Wine SP Red",
    "034": "Summus Cocktail Glass",
    "031": "Wine Style Bourgogne",
    "036": "Wine Style 520",
    "052": "Gunfu 800",
    "045": "Чашки Bonston (2 шт)",
}
NEW_ARTICLES = {"065", "066", "067", "068", "069", "070"}
# хиты продаж — выносим на главную
HIT_ARTICLES = {"001", "004", "007", "012", "014", "020", "021", "026", "035", "043", "062"}

DESCRIPTIONS = {
    "highball": "Классический хайбол для лонг-дринков и хайбол-сетов. Тонкий край, устойчивое дно, "
                "выдерживает интенсивный барный оборот.",
    "oldfashioned": "Тумблер для крепких коктейлей и напитков со льдом. Плотное дно, приятная тактильность, "
                    "чистая подача аромата.",
    "cocktail": "Коктейльный бокал для авторских и классических подач. Тонкая ножка, аккуратный край, "
                "выразительный силуэт на баре.",
    "wine": "Винный бокал с балансом чаши и ножки: раскрывает аромат и удобно ложится в руку гостя.",
    "decanter": "Графин для декантации и эффектной подачи. Форма работает на аэрацию и на визуал стола.",
    "tea": "Чайная посуда для спешалти-подач: жаропрочное стекло, аккуратная геометрия, удобный розлив.",
    "giftbox": "Набор бокалов в подарочной упаковке — готовое решение для подарка гостю, бармену или партнёру.",
}


def nice_name(raw: str) -> str:
    s = re.sub(r"\s+", " ", raw).strip(" -–—")
    if not s:
        return s
    words = []
    for w in s.split(" "):
        if re.fullmatch(r"[A-Za-z]{2,3}", w) and w.upper() in {"JP", "IT", "LB", "ND", "FR", "SP", "ISO"}:
            words.append(w.upper())
        elif re.fullmatch(r"[0-9]+", w) or w in {"&", "|"}:
            words.append(w)
        elif re.match(r"^[а-яА-ЯёЁ]", w):
            words.append(w)
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def parse_volume(raw: str):
    m = re.search(r"(\d+)\s*(ml|мл)", raw, re.I)
    ml = int(m.group(1)) if m else None
    pcs = 2 if re.search(r"[хx]\s*2", raw, re.I) else 1
    return ml, pcs


def extract():
    doc = pymupdf.open(PDF)
    items = []
    for pno, cat in PAGE_CATEGORY.items():
        page = doc[pno]
        blocks = [b for b in page.get_text("blocks") if b[4].strip()]
        specs = [b for b in blocks if "ртикул" in b[4]]
        used = set()
        page_items = []
        for s in specs:
            cands = [
                b for b in blocks
                if b is not s and b[3] <= s[1] + 2 and abs(b[0] - s[0]) < 40
                and "ртикул" not in b[4] and "osudnaya" not in b[4] and id(b) not in used
            ]
            cands.sort(key=lambda b: s[1] - b[3])
            title = cands[0] if cands else None
            if title:
                used.add(id(title))
            txt = s[4]
            art = re.search(r"ртикул:\s*([0-9\-–]+)", txt).group(1).replace("–", "-")
            price = int(re.sub(r"\D", "", re.search(r"ена:\s*([0-9\s ]+)", txt).group(1)))
            vol_raw = re.search(r"бъ[её]м:\s*([^\n]+)", txt, re.I)
            vol_raw = vol_raw.group(1).strip() if vol_raw else ""
            name = NAME_FIX.get(art) or nice_name(title[4] if title else "")
            page_items.append({
                "article": art, "price": price, "volume_raw": vol_raw, "name": name,
                "category": cat, "page": pno,
                "_tx": title[0] if title else s[0], "_ty": (title[1] if title else s[1]) + 8,
            })
        # сопоставляем фото с товаром по близости центра картинки к заголовку
        imgs = []
        for x in page.get_images(full=True):
            for r in page.get_image_rects(x[0]):
                if r.width > 20 and r.height > 20:
                    imgs.append((x[0], r))
        pairs = []
        for i, it in enumerate(page_items):
            for j, (xref, r) in enumerate(imgs):
                d = math.hypot((r.x0 + r.x1) / 2 - it["_tx"], (r.y0 + r.y1) / 2 - it["_ty"])
                pairs.append((d, i, j))
        pairs.sort()
        ti, tj = set(), set()
        for d, i, j in pairs:
            if i in ti or j in tj:
                continue
            ti.add(i)
            tj.add(j)
            page_items[i]["_xref"] = imgs[j][0]
        items.extend(page_items)
    return doc, items


def save_image(doc, xref, path):
    info = doc.extract_image(xref)
    im = Image.open(io.BytesIO(info["image"])).convert("RGB")
    arr = np.asarray(im).astype(int).sum(axis=2)
    mask = arr > 40
    if mask.sum() > 100:  # обрезаем чёрные поля вокруг предмета
        ys, xs = np.where(mask)
        pad = int(0.03 * max(im.size))
        im = im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                      min(im.width, xs.max() + pad), min(im.height, ys.max() + pad)))
    side = int(max(im.size) * 1.14)
    canvas = Image.new("RGB", (side, side), (0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    canvas.resize((720, 720), Image.LANCZOS).save(path, quality=84, optimize=True, progressive=True)


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    doc, items = extract()

    seen, products = set(), []
    for it in items:
        art = it["article"]
        sku = art if art not in seen else f"{art}-gb"
        seen.add(art)
        ml, pcs = parse_volume(it["volume_raw"])
        img = f"assets/products/{sku}.jpg"
        if it.get("_xref"):
            save_image(doc, it["_xref"], os.path.join(IMG_DIR, f"{sku}.jpg"))
        else:
            img = None
        products.append({
            "id": sku,
            "article": art,
            "name": it["name"],
            "category": it["category"],
            "price": it["price"],
            "volumeMl": ml,
            "pieces": pcs,
            "volumeLabel": (f"{ml} мл" + (f" × {pcs}" if pcs > 1 else "")) if ml else it["volume_raw"],
            "image": img,
            "isNew": art in NEW_ARTICLES,
            "isHit": art in HIT_ARTICLES and it["category"] != "giftbox",
            "description": DESCRIPTIONS.get(it["category"], ""),
        })

    catalog = {
        "brand": {
            "name": "Posudnaya Lavka",
            "title": "Посудная лавка",
            "tagline": "Стекло, которое делает ваши моменты особенными",
            "instagram": "the.posudnaya.lavka",
            "telegram": "theposudnayalavkatg",
            "email": "sales@posudnayalavka.com",
            "managers": [
                {"region": "Москва и регионы", "telegram": "titov_kirill", "phone": "+7 961 076-28-68"},
                {"region": "СПб и регионы", "telegram": "RSabanaev", "phone": "+7 961 062-33-33"},
            ],
        },
        "delivery": {
            "freeCities": ["Москва", "Санкт-Петербург"],
            "freeFromRub": 30000,
            "note": "Собираем и отгружаем заказ за 1–2 рабочих дня после оплаты. По Москве и Санкт-Петербургу "
                    "доставка бесплатная, по России — бесплатно от 30 000 ₽ (СДЭК или ПЭК). Отправляем по всему миру.",
        },
        "categories": CATEGORIES,
        "products": products,
        "source": os.path.basename(PDF),
    }
    with open(os.path.join(DATA_DIR, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    print(f"товаров: {len(products)}, фото: {len(os.listdir(IMG_DIR))}")


if __name__ == "__main__":
    main()
