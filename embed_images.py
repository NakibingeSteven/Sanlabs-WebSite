"""
sanlabs image embedder
----------------------
Run this script in the same folder as your sanlabs.html file.

Requirements:
    pip install requests Pillow

What it does:
    1. Downloads 9 free high-quality photos from Unsplash
    2. Crops and resizes each to 600x160px (banner format)
    3. Converts to base64 and embeds directly into sanlabs.html
    4. Saves the result as sanlabs_final.html (fully standalone, no internet needed)
"""

import requests
import base64
import re
import sys
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run:  pip install requests Pillow")
    sys.exit(1)

# ── Free Unsplash photos (no attribution required under Unsplash license) ──
IMAGES = {
    "electronics": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=700&q=85&fm=jpg",
    "arduino":     "https://images.unsplash.com/photo-1553406830-ef2513450d76?w=700&q=85&fm=jpg",
    "pcb":         "https://images.unsplash.com/photo-1588702547919-26089e690ecc?w=700&q=85&fm=jpg",
    "soldering":   "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=700&q=85&fm=jpg",
    "mcad":        "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=700&q=85&fm=jpg",
    "robotics":    "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=700&q=85&fm=jpg",
    "aiml":        "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=700&q=85&fm=jpg",
    "coding":      "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=700&q=85&fm=jpg",
    "simulations": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=700&q=85&fm=jpg",
}

# Order must match the course cards in sanlabs.html
COURSE_ORDER = [
    "electronics",
    "arduino",
    "pcb",
    "soldering",
    "mcad",
    "robotics",
    "aiml",
    "coding",
    "simulations",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

def download_and_encode(name, url):
    print(f"  Downloading {name}...", end=" ", flush=True)
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()

    img = Image.open(BytesIO(r.content)).convert("RGB")
    w, h = img.size

    # Crop to 600:160 aspect ratio (centre crop, slightly favour top)
    target_ratio = 600 / 160
    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = int((h - new_h) * 0.35)   # 35% from top keeps subject in frame
        img = img.crop((0, top, w, top + new_h))

    img = img.resize((600, 160), Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=78, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    kb = len(b64) // 1024
    print(f"OK ({kb} KB)")
    return f"data:image/jpeg;base64,{b64}"


def embed_into_html(html, data_uris):
    """Replace every <div class="course-image">...</div> with an embedded img."""

    pattern = r'(<div class="course-image"[^>]*>)(.*?)(</div>)'
    matches = list(re.finditer(pattern, html, re.DOTALL))

    if len(matches) != len(data_uris):
        print(f"WARNING: found {len(matches)} course-image divs but have {len(data_uris)} images.")

    # Replace from the end so offsets stay valid
    for match, uri in reversed(list(zip(matches, data_uris))):
        img_tag = f'<img src="{uri}" alt="course image" style="width:100%;height:100%;object-fit:cover;display:block">'
        replacement = f'{match.group(1)}{img_tag}{match.group(3)}'
        html = html[:match.start()] + replacement + html[match.end():]

    return html


def update_course_image_css(html):
    """Make sure .course-image has overflow:hidden so images crop cleanly."""
    old = """.course-image {
            width: 100%;
            height: 160px;
            overflow: hidden;
        }

        .course-image svg {
            width: 100%;
            height: 100%;
            display: block;
            transition: transform 0.4s ease;
        }

        .course-card:hover .course-image svg {
            transform: scale(1.04);
        }"""

    new = """.course-image {
            width: 100%;
            height: 160px;
            overflow: hidden;
        }

        .course-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.4s ease;
        }

        .course-card:hover .course-image img {
            transform: scale(1.05);
        }"""

    if old in html:
        html = html.replace(old, new)
    return html


def main():
    input_file  = "template.html"
    output_file = "index.html"

    # ── Read source file ──────────────────────────────────────────────────────
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            html = f.read()
        print(f"Loaded {input_file} ({len(html)//1024} KB)\n")
    except FileNotFoundError:
        print(f"ERROR: '{input_file}' not found.")
        print("Make sure this script is in the same folder as sanlabs.html")
        sys.exit(1)

    # ── Download images ───────────────────────────────────────────────────────
    print("Downloading images:")
    data_uris = []
    failed = []
    for name in COURSE_ORDER:
        url = IMAGES[name]
        try:
            uri = download_and_encode(name, url)
            data_uris.append(uri)
        except Exception as e:
            print(f"FAILED ({e})")
            failed.append(name)
            data_uris.append(None)

    if failed:
        print(f"\nWARNING: {len(failed)} image(s) failed to download: {', '.join(failed)}")
        print("Those slots will keep their current placeholder.\n")
        data_uris = [u for u in data_uris if u is not None]

    # ── Patch HTML ────────────────────────────────────────────────────────────
    print("\nEmbedding images into HTML...")
    html = update_course_image_css(html)
    html = embed_into_html(html, data_uris)

    # ── Write output ──────────────────────────────────────────────────────────
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(html)

    total_kb = len(html) // 1024
    print(f"\nDone! Saved as '{output_file}' ({total_kb} KB)")
    print("Open it in your browser — no internet connection needed.")


if __name__ == "__main__":
    main()
