#!/usr/bin/env python3
"""H3~E1 장면을 'UI 컴포넌트가 하나씩 뜨는' 모션 영상으로 렌더한다(ffmpeg 필요). 줌 효과는 없다.

  python3 promo/build-motion.py               # edit.json에 있는 장면 전부 → promo/out/motion/<장면>.mp4
  python3 promo/build-motion.py --only 2-3

입력: promo/motion/scenes.json(등장 순서·좌표) + promo/motion/<장면>/bg.png, c01.png…
     장면 길이는 promo/edit.json에서 읽는다(녹화 클립 장면은 클립 길이에 맞춰 계산된 값).
인트로 3장은 promo/build-intro.py(어절별 등장)가 따로 만든다.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "motion"
OUT = HERE / "out" / "motion"
FPS = 30
W, H = 1920, 1080
START = 0.2     # 첫 컴포넌트 등장 시각
STAGGER = 0.18  # 컴포넌트 사이 간격
FADE = 0.4      # 한 컴포넌트가 나타나는 시간
RISE = 16       # 아래에서 올라오는 거리(px)


def ease(p):
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def appear_end(index):
    """index번째 컴포넌트가 다 나타나는 시각(초). 녹화 클립 시작 시각을 정할 때 쓴다."""
    return START + index * STAGGER + FADE


def render(key, spec, dur):
    folder = SRC / key
    bg = Image.open(folder / "bg.png").convert("RGBA")
    comps = []
    for i, (x, y) in enumerate(spec["comps"]):
        img = Image.open(folder / f"c{i + 1:02d}.png").convert("RGBA")
        comps.append((img, x, y, START + i * STAGGER))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{key}.mp4"
    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                             "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
    last = None
    for f in range(int(round(dur * FPS))):
        t = f / FPS
        if last is not None and t > comps[-1][3] + FADE:  # 다 나타난 뒤에는 같은 장면
            proc.stdin.write(last)
            continue
        frame = bg.copy()
        for img, x, y, start in comps:
            p = ease((t - start) / FADE)
            if p <= 0:
                continue
            piece = img
            if p < 1:
                piece = img.copy()
                piece.putalpha(img.getchannel("A").point(lambda v, p=p: int(v * p)))
            frame.alpha_composite(piece, (round(x), round(y + RISE * (1 - p))))
        last = frame.convert("RGB").tobytes()
        proc.stdin.write(last)
    proc.stdin.close()
    proc.wait()
    print(f"완료: {out} ({dur:.1f}초, 컴포넌트 {len(comps)}개)")


def main():
    scenes = json.loads((SRC / "scenes.json").read_text())
    edit = json.loads((HERE / "edit.json").read_text())
    durs = {s["id"]: s["dur"] for s in edit["slides"]}
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    for key, spec in scenes.items():
        if key.startswith("_") or (only and key != only):
            continue
        render(key, spec, durs[key])


if __name__ == "__main__":
    main()
