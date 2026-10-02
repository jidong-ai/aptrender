import '../shared/base.css';
import './tablet.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';

const sync = createSync({ role: 'tablet' });
mountHud(sync, { role: 'tablet' });

const presetButtons = [...document.querySelectorAll('[data-preset]')];

// 버튼의 선택 표시는 서버가 확정한 상태로만 그린다(서버가 단일 진실).
function render(state) {
  for (const btn of presetButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.preset === state.preset));
  }
}

sync.on('state', render);
sync.on('info', ({ status }) => {
  document.body.classList.toggle('is-offline', status !== 'online');
});

for (const btn of presetButtons) {
  btn.addEventListener('click', () => sync.patch({ preset: btn.dataset.preset }));
}

document.getElementById('drop').addEventListener('click', () => sync.simulateDrop(5000));
document.getElementById('reset').addEventListener('click', () => sync.reset());
