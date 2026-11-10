#!/usr/bin/env bash
# 프로모션 영상 BGM 만들기(ElevenLabs Music API). 경쾌하고 밝은 인스트루멘털 2곡(A·B)을 만든다.
#
#   ELEVENLABS_API_KEY=sk_... bash promo/gen-bgm.sh          # 영상 길이(edit.json 기준) + 3초
#   ELEVENLABS_API_KEY=sk_... bash promo/gen-bgm.sh 110      # 길이를 초로 지정
#
# 결과: promo/audio/bgm_a.mp3, promo/audio/bgm_b.mp3 (크레딧이 쓰인다)
# 키 권한: Music Generation. 음악의 상업적 사용 조건은 ElevenLabs 요금제를 확인할 것.
set -euo pipefail
cd "$(dirname "$0")"
: "${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY가 필요합니다}"
LEN=${1:-$(python3 -c "import json;c=json.load(open('edit.json'));s=c['slides'];print(round(sum(x['dur'] for x in s)-c['crossfade']*(len(s)-1)+3))")}
MS=$((LEN * 1000))
mkdir -p audio

PROMPT_A="Upbeat, bright and cheerful instrumental background music for a modern home interior service promo video. Acoustic guitar strumming, light hand claps, glockenspiel and soft piano over a bouncy bass, around 118 BPM, major key. Optimistic, fresh and friendly, like a sunny morning planning a new home. Short intro, steady groove that stays behind on-screen text, gentle ending. Instrumental only, no vocals."
PROMPT_B="Light and playful modern pop instrumental for a tech product explainer video. Plucky marimba, finger snaps, warm electric piano and clean electric guitar, around 120 BPM, major key. Happy and confident but not loud or busy. Smooth build in the first ten seconds, consistent energy, soft outro. Instrumental only, no vocals."

gen() {
  local name=$1 prompt=$2
  echo "BGM ${name}: ${LEN}초 만드는 중(1~3분)…"
  local code
  code=$(curl -sS -o "audio/bgm_${name}.mp3" -w "%{http_code}" https://api.elevenlabs.io/v1/music \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" -H "Content-Type: application/json" -H "Accept: audio/mpeg" \
    --max-time 600 \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"prompt":sys.argv[1],"music_length_ms":int(sys.argv[2])}))' "$prompt" "$MS")")
  if [ "$code" != "200" ]; then
    echo "BGM ${name} 실패(${code}): $(head -c 400 "audio/bgm_${name}.mp3")"; rm -f "audio/bgm_${name}.mp3"; return 1
  fi
  echo "BGM ${name} 완료: promo/audio/bgm_${name}.mp3"
}
gen a "$PROMPT_A" & pa=$!
gen b "$PROMPT_B" & pb=$!
wait $pa; wait $pb
