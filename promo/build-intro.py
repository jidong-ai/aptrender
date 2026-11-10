#!/usr/bin/env python3
"""인트로 3장을 어절별 등장 모션으로 렌더한다(ffmpeg 필요).

  python3 promo/build-intro.py            # promo/out/intro/intro01~03.mp4 (어절별)
  python3 promo/build-intro.py --typing --only intro02   # 헤드라인 타이핑 버전 → intro02_typing.mp4
  python3 promo/build-intro.py --only intro03

입력: promo/intro/layout.json + 같은 폴더의 PNG(Figma 'intro수정' 섹션에서 내보낸 배경과 텍스트·카드)
텍스트 PNG를 그대로 잘라 쓰므로 Figma 글꼴·굵기·색이 그대로 나온다.
어절은 PNG에서 글자가 없는 세로 틈 중 가장 넓은 것(어절 수 - 1개)을 경계로 나눈다.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "intro"
MASTER = "--master" in sys.argv  # 고화질 마스터용(out/master/, CRF 10)
OUT = HERE / "out" / ("master/intro" if MASTER else "intro")
ENC = ["-preset", "slow", "-crf", "10"] if MASTER else ["-preset", "medium", "-crf", "16"]
FPS = 30
W, H = 1920, 1080
FADE = 0.35      # 어절 하나가 나타나는 시간
STAGGER = 0.12   # 어절 사이 간격
RISE = 16        # 아래에서 올라오는 거리(px)
TYPE_CPS = 16    # 타이핑: 초당 글자 수


def ease(p):
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def line_bands(alpha, n_lines):
    rows = [any(alpha.getpixel((x, y)) > 8 for x in range(0, alpha.width, 2)) for y in range(alpha.height)]
    bands, start = [], None
    for y, ink in enumerate(rows + [False]):
        if ink and start is None:
            start = y
        elif not ink and start is not None:
            bands.append([start, y])
            start = None
    while len(bands) > n_lines:  # 받침·따옴표 때문에 한 줄이 둘로 갈린 경우 가장 가까운 것끼리 합친다
        gaps = [bands[i + 1][0] - bands[i][1] for i in range(len(bands) - 1)]
        i = gaps.index(min(gaps))
        bands[i] = [bands[i][0], bands[i + 1][1]]
        del bands[i + 1]
    # 줄 높이를 위아래로 넓혀 잘림 방지(줄 사이 중간까지)
    out = []
    for i, (a, b) in enumerate(bands):
        top = 0 if i == 0 else (bands[i - 1][1] + a) // 2
        bot = alpha.height if i == len(bands) - 1 else (b + bands[i + 1][0]) // 2
        out.append((top, bot))
    return out


def split_words(img, text):
    alpha = img.getchannel("A")
    lines = text.split("\n")
    pieces = []
    for (top, bot), line in zip(line_bands(alpha, len(lines)), lines):
        n_words = len(line.split())
        band = alpha.crop((0, top, alpha.width, bot))
        cols = [any(band.getpixel((x, y)) > 8 for y in range(band.height)) for x in range(band.width)]
        ink = [x for x, c in enumerate(cols) if c]
        if not ink:
            continue
        x0, x1 = ink[0], ink[-1] + 1
        gaps, start = [], None
        for x in range(x0, x1):
            if not cols[x] and start is None:
                start = x
            elif cols[x] and start is not None:
                gaps.append((x - start, start, x))
                start = None
        cuts = sorted((s + e) // 2 for _, s, e in sorted(gaps, reverse=True)[: max(0, n_words - 1)])
        edges = [x0] + cuts + [x1]
        for a, b in zip(edges, edges[1:]):
            pieces.append({"box": (a, top, b, bot), "line": (x0, x1, top, bot)})
    return pieces


def build(key, spec, typing):
    bg = Image.open(SRC / spec["bg"]).convert("RGBA")
    items = []  # (image, x, y, start, mode, extra)
    for el in spec["els"]:
        img = Image.open(SRC / el["file"]).convert("RGBA")
        ex, ey = el["xy"]
        if el["kind"] == "block":
            items.append((img, ex, ey, el["at"], "fade", None))
            continue
        pieces = split_words(img, el["text"])
        if typing and el.get("typing"):
            # 줄마다 왼쪽부터 글자 속도로 드러낸다
            t = el["at"]
            lines = {}
            for p in pieces:
                lines.setdefault(p["line"], []).append(p)
            for (x0, x1, top, bot), _ in lines.items():
                crop = img.crop((x0, top, x1, bot))
                n_chars = len(el["text"].replace("\n", ""))
                dur = (x1 - x0) / img.width * n_chars / TYPE_CPS
                ca = crop.getchannel("A")
                stops = [x for x in range(crop.width) if not any(ca.getpixel((x, y)) > 8 for y in range(0, crop.height, 2))] + [crop.width]
                items.append((crop, ex + x0, ey + top, t, "type", (dur, stops)))
                t += dur
            continue
        for i, p in enumerate(pieces):
            items.append((img.crop(p["box"]), ex + p["box"][0], ey + p["box"][1], el["at"] + i * STAGGER, "fade", None))
        print(f"  {key}: {el['file']} → 어절 {len(pieces)}개")

    OUT.mkdir(parents=True, exist_ok=True)
    typed = typing and any(el.get("typing") for el in spec["els"])
    out = OUT / (f"{key}_typing.mp4" if typed else f"{key}.mp4")
    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                             "-c:v", "libx264", *ENC, "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
    n = int(spec["dur"] * FPS)
    for f in range(n):
        t = f / FPS
        frame = bg.copy()
        for img, x, y, start, mode, extra in items:
            if t < start:
                continue
            if mode == "fade":
                p = ease((t - start) / FADE)
                if p <= 0:
                    continue
                piece = img
                if p < 1:
                    a = piece.getchannel("A").point(lambda v, p=p: int(v * p))
                    piece = piece.copy()
                    piece.putalpha(a)
                frame.alpha_composite(piece, (round(x), round(y + RISE * (1 - p))))
            else:  # type
                dur, stops = extra
                p = min(1.0, (t - start) / dur)
                target = int(img.width * p)
                w = max([x for x in stops if x <= target], default=0) if p < 1 else img.width  # 글자 사이 빈 칸에서만 끊는다
                if w > 0:
                    frame.alpha_composite(img.crop((0, 0, w, img.height)), (round(x), round(y)))
                if p < 1 or int(t * 2) % 2 == 0:  # 커서: 타이핑 중에는 계속, 끝나면 깜박임
                    if p < 1 or t < start + dur + 1.2:
                        cur = Image.new("RGBA", (3, int(img.height * 0.7)), (0, 50, 112, 255))
                        frame.alpha_composite(cur, (round(x + w + 4), round(y + img.height * 0.15)))
        proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"완료: {out} ({spec['dur']}초)")
    return out


def main():
    layout = json.loads((SRC / "layout.json").read_text())
    typing = "--typing" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    for key, spec in layout.items():
        if key.startswith("_") or (only and key != only):
            continue
        build(key, spec, typing)


if __name__ == "__main__":
    main()
