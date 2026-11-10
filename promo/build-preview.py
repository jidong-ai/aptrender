#!/usr/bin/env python3
"""프로모션 영상 러프 프리뷰를 만든다(ffmpeg 필요).

  python3 promo/build-preview.py            # promo/out/preview.mp4
  python3 promo/build-preview.py --only 2-3 # 한 장면만 (promo/out/slides/2-3.mp4)

입력
  promo/edit.json         컷 구성(장면 길이, 녹화 클립 구간, 슬롯 좌표)
  promo/frames/*.png      Figma '가로 영상 16:9' 섹션에서 내보낸 1920x1080 프레임
  promo/out/timeline.json npm run promo:record 결과(단계별 시작 시각)

프리뷰는 흐름 확인용이다. 최종 편집은 EDIT_GUIDE.md를 보고 편집 프로그램에서 한다.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SLIDES = OUT / "slides"
FONT = HERE.parent / "mvp/node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf"


def run(args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def seg_range(track, order, step, start, end):
    """단계 이름 + 시작/끝 오프셋 → 영상 기준 [a, b]. end가 None이면 다음 단계 시작까지."""
    t0 = track["steps"][step]
    i = order.index(step)
    t_next = track["steps"][order[i + 1]] if i + 1 < len(order) else track["end"]
    a = t0 + start
    b = t_next if end is None else min(t0 + end, t_next)
    return a, b


def rounded_mask(w, h, r, path):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    m.save(path)


def placeholder(text, path):
    im = Image.new("RGB", (1920, 1080), (18, 18, 20))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([160, 140, 1760, 940], radius=40, outline=(70, 110, 170), width=4)
    font = ImageFont.truetype(str(FONT), 54) if FONT.exists() else ImageFont.load_default()
    d.multiline_text((960, 540), text, font=font, fill=(200, 215, 235), anchor="mm", align="center", spacing=24)
    im.save(path)


def build_slide(s, cfg, timeline, order):
    fps = cfg["fps"]
    dur = s["dur"]
    out = SLIDES / f"{s['id']}.mp4"
    if "placeholder" in s:
        png = SLIDES / f"{s['id']}.png"
        placeholder(s["placeholder"], png)
        frame = png
    else:
        frame = HERE / s["frame"]
    overlays = s.get("overlays", [])
    if not overlays:
        n = int(dur * fps)
        zoom = "zoompan=z='1+0.03*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1920x1080:fps={fps}".format(n=n, fps=fps)
        vf = f"scale=3840:-1,{zoom}" if s.get("motion") == "zoom" else f"fps={fps}"
        run(["-loop", "1", "-t", str(dur), "-i", str(frame), "-vf", vf, "-t", str(dur), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        return out

    inputs = ["-loop", "1", "-t", str(dur), "-i", str(frame)]
    filters = []
    last = "[0:v]"
    idx = 1
    for k, ov in enumerate(overlays):
        track = timeline[ov["role"]]
        video = OUT / track["video"]
        x, y, w, h = ov["slot"]
        until = ov.get("until", dur)
        ranges = [seg_range(track, order, *seg) for seg in ov["segments"]]
        total = sum(b - a for a, b in ranges)
        speed = total / until
        parts = []
        for a, b in ranges:
            inputs += ["-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(video)]
            parts.append(f"[{idx}:v]fps={fps},setpts=PTS-STARTPTS[p{k}_{idx}]")
            idx += 1
        mask = SLIDES / f"mask_{w}x{h}_{ov['radius']}.png"
        rounded_mask(w, h, ov["radius"], mask)
        inputs += ["-loop", "1", "-i", str(mask)]
        mask_idx = idx
        idx += 1
        labels = "".join(f"[p{k}_{i}]" for i in range(mask_idx - len(ranges), mask_idx))
        filters += parts
        filters.append(f"{labels}concat=n={len(ranges)}:v=1:a=0,setpts=PTS/{speed:.4f},fps={fps},"
                       f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=rgba[c{k}]")
        filters.append(f"[{mask_idx}:v]format=gray,scale={w}:{h}[m{k}]")
        filters.append(f"[c{k}][m{k}]alphamerge[a{k}]")
        if until < dur:
            fade_at = max(0.0, until - 0.5)
            filters.append(f"[a{k}]fade=t=out:st={fade_at:.2f}:d=0.5:alpha=1[f{k}]")
            src = f"[f{k}]"
        else:
            src = f"[a{k}]"
        filters.append(f"{last}{src}overlay={x}:{y}:eof_action=pass:shortest=0[o{k}]")
        last = f"[o{k}]"
        print(f"  {s['id']} {ov['role']}: 원본 {total:.1f}초 → {until:.1f}초 ({speed:.2f}배속)")
    filters.append(f"{last}fps={fps},format=yuv420p[vout]")
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[vout]", "-t", str(dur), "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(out)])
    return out


def main():
    cfg = json.loads((HERE / "edit.json").read_text())
    timeline = json.loads((OUT / "timeline.json").read_text())
    order = list(timeline["tablet"]["steps"].keys())
    SLIDES.mkdir(parents=True, exist_ok=True)
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    slides = [s for s in cfg["slides"] if not only or s["id"] == only]
    files = [build_slide(s, cfg, timeline, order) for s in slides]
    if only:
        print(f"완료: {files[0]}")
        return

    # 크로스페이드로 잇기
    xf = cfg["crossfade"]
    inputs, filters = [], []
    for f in files:
        inputs += ["-i", str(f)]
    offset = 0.0
    last = "[0:v]"
    for i in range(1, len(files)):
        offset += cfg["slides"][i - 1]["dur"] - xf
        filters.append(f"{last}[{i}:v]xfade=transition=fade:duration={xf}:offset={offset:.3f}[x{i}]")
        last = f"[x{i}]"
    preview = OUT / "preview.mp4"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", last, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(preview)])
    total = sum(s["dur"] for s in cfg["slides"]) - xf * (len(files) - 1)
    print(f"완료: {preview} ({total:.1f}초)")


if __name__ == "__main__":
    main()
