// 연동·재접속 확인용 디버그 표시. 전시 때는 ?hud=0 으로 숨긴다.
const STATUS_TEXT = {
  connecting: '○ 연결 중…',
  online: '● 연결됨',
  offline: '× 끊김 · 재연결 시도 중',
  held: '× 테스트로 끊음',
};

const clock = () => new Date().toTimeString().slice(0, 8); // HH:MM:SS

export function mountHud(sync, { role, hints = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.hidden = new URLSearchParams(location.search).get('hud') === '0';
  document.body.append(el);

  const logs = [];
  sync.on('log', (text) => {
    logs.unshift(`${clock()}  ${text}`);
    logs.length = Math.min(logs.length, 5);
    render();
  });
  sync.on('info', render);

  function render() {
    const { status, clientId, rev, snapshots, rtt, peers, heldUntil } = sync.info;
    let head = STATUS_TEXT[status];
    if (status === 'held') head += ` · ${Math.max(0, Math.ceil((heldUntil - Date.now()) / 1000))}초 후 재연결`;

    const online = status === 'online';
    const lines = [
      head,
      `${role}#${clientId ?? '-'} · rev ${rev ?? '-'} · 스냅샷 ${snapshots}회 · RTT ${online && rtt !== null ? rtt : '-'}ms`,
      online ? `접속 중: 태블릿 ${peers.tablet ?? 0} · XR ${peers.xr ?? 0}` : '접속 중: 알 수 없음 (서버와 끊김)',
    ];
    if (role === 'xr' && sync.info.tabletUrl) lines.push(`아이패드 주소: ${sync.info.tabletUrl}`);
    if (hints) lines.push(hints);

    el.dataset.status = status;
    el.textContent = '';
    for (const text of lines) el.append(Object.assign(document.createElement('div'), { textContent: text }));
    const log = Object.assign(document.createElement('div'), { className: 'hud-log' });
    for (const text of logs) log.append(Object.assign(document.createElement('div'), { textContent: text }));
    el.append(log);
  }

  // 'held' 카운트다운 갱신
  setInterval(() => sync.info.status === 'held' && render(), 500);
  render();

  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
      return !el.hidden;
    },
  };
}
