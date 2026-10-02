import '../shared/base.css';
import './xr.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';

// Day 1 임시: 조합별 배경색. D2부터 파노라마로 교체
const PRESET_COLORS = { A: '#c8553d', B: '#3d6fc8', C: '#3da57a' };
const STAGE_W = 1920;
const STAGE_H = 1080;

const stage = document.getElementById('stage');
const presetLabel = document.getElementById('presetLabel');

const sync = createSync({ role: 'xr' });
const hud = mountHud(sync, { role: 'xr', hints: 'F 전체화면 · H 표시 숨김 · D 5초간 연결 끊기' });
document.body.classList.toggle('show-guides', !hud.el.hidden);

sync.on('state', (state) => {
  document.body.style.backgroundColor = PRESET_COLORS[state.preset];
  presetLabel.textContent = state.preset;
});

function fitStage() {
  const scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
addEventListener('resize', fitStage);
fitStage();

addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      break;
    case 'h':
      document.body.classList.toggle('show-guides', hud.toggle());
      break;
    case 'd':
      sync.simulateDrop(5000);
      break;
  }
});
