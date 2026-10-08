// docs/SCENARIO.md(단계표)를 src/shared/scenario.js에서 다시 만든다.  실행: npm run docs:scenario
import fs from 'node:fs';
import { SPEAKERS, STEPS } from '../src/shared/scenario.js';

const TARGET = {
  start: "CTA '시작하기'",
  'prologue-next': '화면 아무 곳이나 탭',
  'prologue-start': "CTA '상담 플로우 시작하기'",
  restart: "CTA '다시 체험하기'",
  'caption-next': '캡션 다음',
  hotspot: '바닥 화살표',
  trace: '점선 체크 따라 그리기',
  'tool:measure': '치수확인',
  'tool:annotate': '주석추가',
  'tool:options': '옵션수정',
  'nav:ohouse': '하단 오늘의집',
  'nav:detail': '하단 상담상세',
  'category:object': '오브제 카테고리',
  product: '제품 카드',
  'floor-surface': '깜박이는 바닥면',
  'detail:island': '아일랜드 카드',
  'detail:floor': '바닥 카드',
  'choice:island': '후보 a·b·c 중 하나',
  'choice:floor': '후보 2개 중 하나',
  chip: '선택된 색상 칩',
  apply: '적용하기',
  'send-report': '상담 리포트 보내기',
};
const PANEL = { loading: '로딩 카드', ohouse: '오늘의집 카드', catalog: '카탈로그', detail: '상담상세', options: '옵션수정', summary: '상담 요약' };
const XR = { standby: '대기 화면', boot: '부팅', ending: '리포트 카드 + 엔딩', home: '상담홈' };

const esc = (t) => t.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const rows = STEPS.map((s) => {
  const t = s.tablet;
  const extras = [t.moodboard && '무드보드', t.area === 'blink' && '바닥면 깜박임', t.area === 'on' && '바닥 선택 영역', t.waiting && '대기'].filter(Boolean);
  const tablet =
    t.screen === 'start' ? '시작화면(Figma 1433:3379)' : t.screen === 'prologue' ? `프롤로그 ${t.page}장(Figma ${['1433:3453', '1433:3463', '1433:3469'][t.page - 1]})` : t.screen === 'ending' ? '엔딩' : `${t.pano}${t.panel ? ` + ${PANEL[t.panel]}${t.expand ? '(후보 펼침)' : ''}` : ''}${t.annotate ? ' + 주석 도구' : ''}${extras.map((x) => ` + ${x}`).join('')}`;
  const caption = s.caption ? `${SPEAKERS[s.caption.speaker]}: ${esc(s.caption.text)}` : s.copy ? `(본문) ${esc(s.copy)}` : '—';
  const guide = s.guide ? esc(s.guide) : '—';
  let next = s.auto ? `자동 ${s.auto / 1000}초${s.next === 'reset' ? ' → 처음으로' : ''}` : `${TARGET[s.target] ?? s.target}${s.look ? ' (60° 둘러보기 또는 6초 뒤 열림)' : ''}${s.collect ? ` ${s.values.length}개 모두` : ''}`;
  if (s.set) {
    const fixed = s.values?.length === 1 || !s.values;
    const sample = s.set(fixed ? s.values?.[0] : '선택값');
    next += ` → ${Object.entries(sample).map(([k, v]) => `${k}=${v}`).join(', ')}`;
  }
  const OFFER = { island: '아일랜드 카드', floor: '바닥재 카드 2개' };
  const xr = [
    XR[s.xr.screen],
    s.xr.pano && s.xr.pano !== 'kitchen_front' && s.xr.pano,
    s.xr.dims && '치수선',
    s.xr.moodboard && '무드보드',
    s.xr.offer && (s.xr.choose ? `${OFFER[s.xr.offer]} → **김민선이 ${s.xr.choose} 고름**` : `${OFFER[s.xr.offer]}(제안한 순서대로 뜸)`),
    s.say && `자막(매니저): ${esc(s.say)}`,
    s.caption?.speaker === 'customer' && s.xr.screen === 'home' && '자막(김민선)',
  ].filter(Boolean).join(' · ');
  return `| ${s.id} | ${tablet} | ${guide} | ${caption} | ${next} | ${xr} |`;
});

const md = `# 체험 단계표 (게임형 가이드 플로우)

> 이 표는 \`src/shared/scenario.js\`에서 만든다. 문구·순서를 바꾸려면 scenario.js를 고친 뒤 \`npm run docs:scenario\`.

- 체험자가 매니저 역할이라 헷갈리지 않게, **매니저 말풍선은 매장 장면(S0-4~S0-5b)에만** 나온다. 상담 중에는 **가이드 UI**(Figma 1438:4043, 상단 도구 아래 파란 글씨 한 줄)가 할 일을 알려 준다
- 김민선 말풍선(Figma 1434:3719)은 고객 대사. XR 자막에도 같은 말이 나온다. 체험자가 맡은 매니저의 대사(\`say\`)는 태블릿에는 안 보이고 XR 자막으로만 나온다(고객이 듣는 말)
- S3·S4는 **매니저가 제안 → 김민선이 XR에서 고른다**: 태블릿에서 제안한 제품이 XR에 카드로 뜨고, 김민선이 카드를 살펴보다 하나를 고르는 장면이 재생된다(그동안 태블릿은 '고르는 중' 대기)
- 말풍선을 누르면 다음으로(» 화살표가 움직여 알려 줌). 'CTA button'(시작하기·상담 플로우 시작하기·적용하기·상담 리포트 보내기·다시 체험하기)은 이미 색으로 강조되므로 가이드 링을 띄우지 않는다
- 프롤로그는 '< Prologue'로 이전 장으로 돌아갈 수 있다
- "다음 조건"의 대상만 누를 수 있다. 다른 버튼은 막히고 대상이 흔들린다. 파노라마 드래그는 항상 허용
- 선택 결과(아일랜드·바닥재)는 \`flow.choices\`에 쌓이고 XR 장면·예상 금액에 반영된다
- 직원 메뉴(태블릿 왼쪽 위 2초 길게 누르기)·아이맥 ←/→ 키로 아무 단계나 바로 갈 수 있다

| ID | 태블릿 화면 | 가이드 UI | 말풍선 | 다음 조건 → 선택 | XR |
|---|---|---|---|---|---|
${rows.join('\n')}

## 아직 정하지 않은 것

- S4-2a 매니저 대사의 "어두운 타일자재"와 실제 바닥재(포틀랜드 모티프·플로쏘, 밝은 톤)의 정합. 바닥재 사진은 지금 guide/타일옵션 이미지에서 자른 견본
- 무드보드 사진 4장, S1 헤드셋 착용 이미지(지금은 와이어프레임 자리)
- kitchen_side 바닥 마스크(지금은 임시 다각형. Figma로 kitchen_side_floor.svg를 그려 assets/pano/masks/에 넣으면 그걸 쓴다)
- S5 아웃트로 디자인(지금은 와이어프레임: 상담 요약 → 리포트 보내기 → 엔딩)
- 금액은 전시용 예시(\`src/shared/catalog.js\`)
`;
fs.writeFileSync(new URL('../docs/SCENARIO.md', import.meta.url), md);
console.log(`docs/SCENARIO.md 갱신 (${STEPS.length}단계)`);
