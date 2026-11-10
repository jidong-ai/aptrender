#!/usr/bin/env python3
"""프로모션 영상 러프 프리뷰를 만든다(ffmpeg 필요).

  python3 promo/build-preview.py            # promo/out/preview.mp4 (무음)
  python3 promo/build-preview.py --bgm promo/audio/bgm_a.mp3   # BGM 포함
  python3 promo/build-preview.py --only 2-3 # 한 장면만 (promo/out/slides/2-3.mp4)

입력
  promo/edit.json         컷 구성(장면 길이, 녹화 클립 구간, 슬롯 좌표)
  promo/frames/*.png      Figma '가로 영상 16:9' 섹션에서 내보낸 1920x1080 프레임
  promo/out/timeline.json npm run promo:record 결과(단계별 시작 시각)
  promo/out/intro/*.mp4   python3 promo/build-intro.py 결과(인트로 3장)

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
    if "video" in s:  # 미리 만든 영상(인트로: build-intro.py, 장면 모션: build-motion.py)
        return HERE / s["video"]
    if "placeholder" in s:  # 정지 화면(움직임 없음)
        png = SLIDES / f"{s['id']}.png"
        placeholder(s["placeholder"], png)
        run(["-loop", "1", "-t", str(dur), "-i", str(png), "-vf", f"fps={fps}", "-t", str(dur), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        return out

    overlays = s.get("overlays", [])
    inputs = ["-i", str(HERE / s["base"])]  # 바탕: 컴포넌트가 하나씩 뜨는 모션 영상
    filters = []
    last = "[0:v]"
    idx = 1
    for k, ov in enumerate(overlays):
        track = timeline[ov["role"]]
        video = OUT / track["video"]
        x, y, w, h = ov["slot"]
        start = ov.get("start", 0.0)  # 슬롯 자리 화면이 다 뜬 뒤 클립 시작
        base_speed = cfg.get("clipSpeed", 1.5)
        segs = [(seg_range(track, order, *seg[:3]), seg[3] if len(seg) > 3 else base_speed) for seg in ov["segments"]]
        total = sum((b - a) / sp for (a, b), sp in segs)  # 배속을 적용한 클립 길이
        parts = []
        for (a, b), sp in segs:
            inputs += ["-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(video)]
            parts.append(f"[{idx}:v]fps={fps},setpts=(PTS-STARTPTS)/{sp}[p{k}_{idx}]")
            idx += 1
        ranges = segs
        mask = SLIDES / f"mask_{w}x{h}_{ov['radius']}.png"
        rounded_mask(w, h, ov["radius"], mask)
        inputs += ["-loop", "1", "-i", str(mask)]
        mask_idx = idx
        idx += 1
        labels = "".join(f"[p{k}_{i}]" for i in range(mask_idx - len(ranges), mask_idx))
        filters += parts
        filters.append(f"{labels}concat=n={len(ranges)}:v=1:a=0,setpts=PTS-STARTPTS+{start}/TB,fps={fps},"
                       f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=rgba[c{k}]")
        filters.append(f"[{mask_idx}:v]format=gray,scale={w}:{h}[m{k}]")
        filters.append(f"[c{k}][m{k}]alphamerge[a{k}]")
        src = f"[a{k}]"
        filters.append(f"{last}{src}overlay={x}:{y}:eof_action=pass:shortest=0[o{k}]")
        last = f"[o{k}]"
        print(f"  {s['id']} {ov['role']}: 구간 {len(segs)}개, 배속 {[sp for _, sp in segs]} → {total:.1f}초 ({start:.2f}초부터)")
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
    total = sum(s["dur"] for s in cfg["slides"]) - xf * (len(files) - 1)
    video = OUT / "preview_video.mp4"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", last, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", str(video)])

    # BGM: --bgm 파일(없으면 무음). 영상 길이로 자르고 1초 페이드인, 2.5초 페이드아웃, 음량 -16 LUFS로 맞춘다
    bgm = sys.argv[sys.argv.index("--bgm") + 1] if "--bgm" in sys.argv else None
    if bgm:
        af = f"atrim=0:{total:.2f},afade=t=in:d=1,afade=t=out:st={total - 2.5:.2f}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11"
        run(["-i", str(video), "-i", bgm, "-filter_complex", f"[1:a]{af}[a]", "-map", "0:v", "-map", "[a]",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(preview)])
    else:
        run(["-i", str(video), "-c", "copy", "-movflags", "+faststart", str(preview)])
    video.unlink()
    print(f"완료: {preview} ({total:.1f}초{', BGM ' + Path(bgm).name if bgm else ', 무음'})")


if __name__ == "__main__":
    main()
