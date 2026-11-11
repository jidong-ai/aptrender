#!/usr/bin/env python3
"""4K(3840x2160) 최종 영상을 렌더한다(ffmpeg 필요).

  python3 promo/build-4k.py --bgm promo/audio/bgm_a.mp3     # → promo/out/Weave_promo_4k.mp4
  python3 promo/build-4k.py --only I3                       # 한 장면만 → promo/out/4k/scenes/I3.mp4

입력
  promo/scenes4k/manifest.json   장면 1~17 → edit.json 장면 id, 컴포넌트 좌표(4K)
  promo/scenes4k/S<n>/bg.png      Figma '가로 영상 16:9' 섹션을 2배로 내보낸 배경(컴포넌트 숨김)
  promo/scenes4k/S<n>/cNN.png     컴포넌트(렌더 영역 기준)
  promo/edit.json                 장면 길이, 녹화 클립 구간·배속·슬롯(1080p 좌표 → 여기서 2배)
  promo/out/timeline.json, out/raw/*.webm   녹화 클립(npm run promo:record)

모션
  장면 1~3   문장 단위로 아래에서 밀어올리며 등장(줄마다 마스크 안에서 올라옴).
             예외: 장면 2 헤드라인 '어떻게 내 취향을…'은 어절별 등장.
  장면 16    태그라인 어절별 등장(기존과 같음).
  나머지     UI 컴포넌트가 0.18초 간격으로 하나씩 페이드업.
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SRC = HERE / "scenes4k"
OUT = HERE / "out"
WORK = OUT / "4k"
FPS = 30
W, H = 3840, 2160
S = 2  # 1080p 좌표 → 4K 배율

# 컴포넌트 페이드업(build-motion.py와 같은 타이밍, 거리만 2배)
C_START, C_STAGGER, C_FADE, C_RISE = 0.2, 0.18, 0.4, 16 * S
# 어절별(build-intro.py와 같은 타이밍)
W_STAGGER, W_FADE, W_RISE = 0.12, 0.35, 16 * S
# 문장 밀어올리기
P_DUR = 0.7         # 한 줄이 다 올라오는 시간
P_LINE_GAP = 0.1    # 같은 문장 안에서 줄 사이 간격
P_FADE = 0.45       # 올라오는 동안 투명도가 0→1이 되는 비율(P_DUR 대비)

ENC_MID = ["-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p"]
ENC_FINAL = ["-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-level", "5.1",
             "-tune", "stillimage", "-pix_fmt", "yuv420p"]

# 장면 1~3·16의 요소별 모션. kind: push(문장 밀어올리기, lines=줄 수) / words(어절별) / fade(컴포넌트 페이드업)
# at = 등장 시작(초). 기존 인트로(intro/layout.json)와 같은 타이밍.
INTRO = {
    "I1": [{"kind": "push", "lines": 1, "at": 0.3},   # 로고
           {"kind": "push", "lines": 1, "at": 0.9}],  # 전문가와 함께하는 인테리어 XR 서비스
    "I2": [{"kind": "push", "lines": 1, "at": 0.3},   # 계획부터 시공까지 …
           {"kind": "words", "text": "어떻게 내 취향을 정확하게 전달할 수 있을까요?", "at": 1.6}],
    "I3": [{"kind": "push", "lines": 2, "at": 0.3},   # 오늘의집 Weave는 … (한 문장, 2줄)
           {"kind": "fade", "at": 2.0},                # 소비자 카드
           {"kind": "push", "lines": 2, "at": 2.4},   # “취향을 구현하기 위한 …”
           {"kind": "fade", "at": 3.3},                # 전문가 카드
           {"kind": "push", "lines": 2, "at": 3.7}],  # “불가능한 시공을 요구받고, …”
    "O1": [{"kind": "words", "text": "누구나 자신이 원하는 공간을 만들 수 있도록", "at": 0.3}],
}


def ease(p):
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def ease_quart(p):
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 4


def run(args):
    subprocess.run(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", *args], check=True)


def ink_rows(alpha):
    small = alpha.resize((max(1, alpha.width // 4), alpha.height))
    return [any(small.getpixel((x, y)) > 8 for x in range(small.width)) for y in range(small.height)]


def line_bands(alpha, n_lines):
    """글자가 있는 가로 띠 n개. 띠 경계는 줄 사이 중간(마스크가 글자를 자르지 않게)."""
    rows = ink_rows(alpha)
    bands, start = [], None
    for y, ink in enumerate(rows + [False]):
        if ink and start is None:
            start = y
        elif not ink and start is not None:
            bands.append([start, y])
            start = None
    while len(bands) > n_lines:  # 받침·따옴표로 한 줄이 갈린 경우 가까운 것끼리 합친다
        gaps = [bands[i + 1][0] - bands[i][1] for i in range(len(bands) - 1)]
        i = gaps.index(min(gaps))
        bands[i] = [bands[i][0], bands[i + 1][1]]
        del bands[i + 1]
    out = []
    for i, (a, b) in enumerate(bands):
        top = 0 if i == 0 else (bands[i - 1][1] + a) // 2
        bot = alpha.height if i == len(bands) - 1 else (b + bands[i + 1][0]) // 2
        out.append((top, bot))
    return out


def split_words(img, text):
    alpha = img.getchannel("A")
    lines = text.split("\n")
    boxes = []
    for (top, bot), line in zip(line_bands(alpha, len(lines)), lines):
        n_words = len(line.split())
        band = alpha.crop((0, top, alpha.width, bot))
        small = band.resize((band.width, max(1, band.height // 2)))
        cols = [any(small.getpixel((x, y)) > 8 for y in range(small.height)) for x in range(small.width)]
        ink = [x for x, c in enumerate(cols) if c]
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
        boxes += [(a, top, b, bot) for a, b in zip(edges, edges[1:])]
    return boxes


def with_alpha(img, p):
    if p >= 1:
        return img
    out = img.copy()
    out.putalpha(img.getchannel("A").point(lambda v, p=p: int(v * p)))
    return out


class Piece:
    """프레임에 얹는 조각 하나."""

    def __init__(self, img, x, y, start, mode):
        self.img, self.x, self.y, self.start, self.mode = img, x, y, start, mode
        self.end = start + (P_DUR if mode == "push" else W_FADE if mode == "word" else C_FADE)

    def draw(self, frame, t):
        if t < self.start:
            return
        if self.mode == "push":
            # 줄 높이만큼 아래에서 마스크(줄 영역) 안으로 밀려 올라온다
            p = (t - self.start) / P_DUR
            off = round(self.img.height * (1 - ease_quart(p)))
            a = ease(p / P_FADE)
            if off >= self.img.height or a <= 0:
                return
            visible = self.img.crop((0, 0, self.img.width, self.img.height - off))
            frame.alpha_composite(with_alpha(visible, a), (round(self.x), round(self.y) + off))
            return
        fade, rise = (W_FADE, W_RISE) if self.mode == "word" else (C_FADE, C_RISE)
        p = ease((t - self.start) / fade)
        if p <= 0:
            return
        frame.alpha_composite(with_alpha(self.img, p), (round(self.x), round(self.y + rise * (1 - p))))


def scene_pieces(sid, key, comps):
    pieces = []
    plan = INTRO.get(sid)
    for i, (x, y) in enumerate(comps):
        img = Image.open(SRC / key / f"c{i + 1:02d}.png").convert("RGBA")
        if not plan:
            pieces.append(Piece(img, x, y, C_START + i * C_STAGGER, "fade"))
            continue
        el = plan[i]
        if el["kind"] == "fade":
            pieces.append(Piece(img, x, y, el["at"], "fade"))
        elif el["kind"] == "push":
            for j, (top, bot) in enumerate(line_bands(img.getchannel("A"), el["lines"])):
                pieces.append(Piece(img.crop((0, top, img.width, bot)), x, y + top, el["at"] + j * P_LINE_GAP, "push"))
        else:  # words
            boxes = split_words(img, el["text"])
            for j, b in enumerate(boxes):
                pieces.append(Piece(img.crop(b), x + b[0], y + b[1], el["at"] + j * W_STAGGER, "word"))
            print(f"  {sid}: 어절 {len(boxes)}개")
    return pieces


def render_scene(sid, key, comps, dur):
    out = WORK / "scenes" / f"{sid}.mp4"
    bg = Image.open(SRC / key / "bg.png").convert("RGBA")
    pieces = scene_pieces(sid, key, comps)
    settle = max(p.end for p in pieces)
    proc = subprocess.Popen(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                             "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", *ENC_MID, str(out)], stdin=subprocess.PIPE)
    last = None
    for f in range(int(round(dur * FPS))):
        t = f / FPS
        if last is None or t <= settle + 1 / FPS:
            frame = bg.copy()
            for p in pieces:
                p.draw(frame, t)
            last = frame.convert("RGB").tobytes()
        proc.stdin.write(last)
    proc.stdin.close()
    proc.wait()
    print(f"완료: {out.relative_to(HERE.parent)} ({dur:.1f}초, 조각 {len(pieces)}개)")
    return out


def seg_range(track, order, step, start, end):
    t0 = track["steps"][step]
    i = order.index(step)
    t_next = track["steps"][order[i + 1]] if i + 1 < len(order) else track["end"]
    return t0 + start, (t_next if end is None else min(t0 + end, t_next))


def add_overlays(slide, base, cfg, timeline, order):
    """build-preview.py와 같은 방식으로 녹화 클립을 슬롯에 얹는다(좌표·모서리만 2배)."""
    fps, out = cfg["fps"], WORK / "slides" / f"{slide['id']}.mp4"
    inputs, filters, last, idx = ["-i", str(base)], [], "[0:v]", 1
    for k, ov in enumerate(slide["overlays"]):
        track = timeline[ov["role"]]
        video = OUT / track["video"]
        x, y, w, h = (v * S for v in ov["slot"])
        r = ov["radius"] * S
        start = ov.get("start", 0.0)
        base_speed = cfg.get("clipSpeed", 1.5)
        segs = [(seg_range(track, order, *sg[:3]), sg[3] if len(sg) > 3 else base_speed) for sg in ov["segments"]]
        first = idx
        for (a, b), sp in segs:
            inputs += ["-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(video)]
            filters.append(f"[{idx}:v]fps={fps},setpts=(PTS-STARTPTS)/{sp}[p{k}_{idx}]")
            idx += 1
        mask = WORK / "slides" / f"mask_{w}x{h}_{r}.png"
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
        m.save(mask)
        inputs += ["-loop", "1", "-i", str(mask)]
        labels = "".join(f"[p{k}_{i}]" for i in range(first, idx))
        filters.append(f"{labels}concat=n={len(segs)}:v=1:a=0,setpts=PTS-STARTPTS+{start}/TB,fps={fps},"
                       f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},format=rgba[c{k}]")
        filters.append(f"[{idx}:v]format=gray,scale={w}:{h}[m{k}]")
        filters.append(f"[c{k}][m{k}]alphamerge[a{k}]")
        filters.append(f"{last}[a{k}]overlay={x}:{y}:eof_action=pass:shortest=0[o{k}]")
        last = f"[o{k}]"
        idx += 1
        total = sum((b - a) / sp for (a, b), sp in segs)
        print(f"  {slide['id']} {ov['role']}: 슬롯 {w}x{h}, 배속 {[sp for _, sp in segs]} → {total:.1f}초 ({start:.2f}초부터)")
    filters.append(f"{last}fps={fps},format=yuv420p[vout]")
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[vout]", "-t", str(slide["dur"]), *ENC_MID, str(out)])
    print(f"완료: {out.relative_to(HERE.parent)}")
    return out


def main():
    cfg = json.loads((HERE / "edit.json").read_text())
    manifest = {v["id"]: (k, v["comps"]) for k, v in json.loads((SRC / "manifest.json").read_text()).items() if not k.startswith("_")}
    timeline = json.loads((OUT / "timeline.json").read_text())
    order = list(timeline["tablet"]["steps"].keys())
    for d in ("scenes", "slides"):
        (WORK / d).mkdir(parents=True, exist_ok=True)
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    slides = [s for s in cfg["slides"] if not only or s["id"] == only]

    def build(s):
        key, comps = manifest[s["id"]]
        base = render_scene(s["id"], key, comps, s["dur"])
        return add_overlays(s, base, cfg, timeline, order) if s.get("overlays") else base

    with ThreadPoolExecutor(max_workers=2) as pool:
        files = list(pool.map(build, slides))
    if only:
        return

    xf = cfg["crossfade"]
    inputs, filters, offset, last = [], [], 0.0, "[0:v]"
    for f in files:
        inputs += ["-i", str(f)]
    for i in range(1, len(files)):
        offset += cfg["slides"][i - 1]["dur"] - xf
        filters.append(f"{last}[{i}:v]xfade=transition=fade:duration={xf}:offset={offset:.3f}[x{i}]")
        last = f"[x{i}]"
    total = sum(s["dur"] for s in cfg["slides"]) - xf * (len(files) - 1)
    video = WORK / "video.mp4"
    print(f"이어 붙이는 중(4K, {total:.1f}초)…")
    run([*inputs, "-filter_complex", ";".join(filters), "-map", last, *ENC_FINAL, str(video)])

    final = OUT / "Weave_promo_4k.mp4"
    bgm = sys.argv[sys.argv.index("--bgm") + 1] if "--bgm" in sys.argv else None
    if bgm:
        af = f"atrim=0:{total:.2f},afade=t=in:d=1,afade=t=out:st={total - 2.5:.2f}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11"
        run(["-i", str(video), "-i", bgm, "-filter_complex", f"[1:a]{af}[a]", "-map", "0:v", "-map", "[a]",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(final)])
    else:
        run(["-i", str(video), "-c", "copy", "-movflags", "+faststart", str(final)])
    video.unlink()
    print(f"완료: {final.relative_to(HERE.parent)} ({total:.1f}초{', BGM ' + Path(bgm).name if bgm else ', 무음'})")


if __name__ == "__main__":
    main()
