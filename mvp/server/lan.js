import os from 'node:os';

// 가상·터널 인터페이스는 아이패드가 닿을 수 없으므로 뒤로 미루거나 뺀다.
const IGNORED = /^(lo|docker|br-|veth|vmnet|vboxnet|utun|awdl|llw|bridge|gif|stf|anpi|ap\d|tailscale|zt|vethernet|virtualbox|vmware|loopback|bluetooth)/i;
const PREFERRED = /^(en|eth|wlan|wl|wi-?fi|무선|이더넷)/i; // macOS·리눅스·윈도우(Wi-Fi, 이더넷)

function isPrivate(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// 아이패드가 접속할 후보 IPv4 주소. 가장 유력한 주소가 첫 번째.
// macOS 와이파이는 보통 en0(맥북) 또는 en1(일부 아이맥)이다.
export function getLanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      const isV4 = addr.family === 'IPv4' || addr.family === 4;
      if (!isV4 || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue; // DHCP 실패 시 자동 할당 주소
      if (IGNORED.test(name)) continue;
      found.push({ name, address: addr.address });
    }
  }
  const score = ({ name, address }) =>
    (isPrivate(address) ? 0 : 10) + (PREFERRED.test(name) ? 0 : 5);
  return found.sort((x, y) => score(x) - score(y) || x.name.localeCompare(y.name, 'en', { numeric: true }));
}
