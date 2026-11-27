// Menu HTML đè lên game: chọn đội, chọn nhân vật, mua súng (B) và bảng điểm (Tab).
// Bản web không có VGUI nên menu gốc của CS chỉ là chữ nhỏ; ở đây gửi đúng lệnh console
// (jointeam / joinclass / lệnh mua) vào engine, server vẫn tự kiểm tra tiền, đội, vùng mua.
import type { Xash3DWebRTC } from './webrtc';
import { onEnginePrint } from './engine';

type Team = 'T' | 'CT';
type Item = { cmd: string; name: string; price: number; img: string; team?: Team };

const UI = '/ui/';

const BUY: { title: string; items: Item[] }[] = [
  {
    title: 'Súng lục',
    items: [
      { cmd: 'glock', name: 'Glock-18', price: 400, img: 'glock18' },
      { cmd: 'usp', name: 'USP', price: 500, img: 'usp45' },
      { cmd: 'p228', name: 'P228', price: 600, img: 'p228' },
      { cmd: 'deagle', name: 'Desert Eagle', price: 650, img: 'deserteagle' },
      { cmd: 'elites', name: 'Dual Elites', price: 800, img: 'elites', team: 'T' },
      { cmd: 'fn57', name: 'Five-SeveN', price: 750, img: 'fiveseven', team: 'CT' },
    ],
  },
  {
    title: 'Shotgun',
    items: [
      { cmd: 'm3', name: 'M3 Super 90', price: 1700, img: 'm3' },
      { cmd: 'xm1014', name: 'XM1014', price: 3000, img: 'xm1014' },
    ],
  },
  {
    title: 'Tiểu liên',
    items: [
      { cmd: 'mac10', name: 'MAC-10', price: 1400, img: 'mac10', team: 'T' },
      { cmd: 'tmp', name: 'TMP', price: 1250, img: 'tmp', team: 'CT' },
      { cmd: 'mp5', name: 'MP5 Navy', price: 1500, img: 'mp5' },
      { cmd: 'ump45', name: 'UMP45', price: 1700, img: 'ump45' },
      { cmd: 'p90', name: 'P90', price: 2350, img: 'p90' },
    ],
  },
  {
    title: 'Súng trường',
    items: [
      { cmd: 'galil', name: 'Galil', price: 2000, img: 'galil', team: 'T' },
      { cmd: 'famas', name: 'FAMAS', price: 2250, img: 'famas', team: 'CT' },
      { cmd: 'ak47', name: 'AK-47', price: 2500, img: 'ak47', team: 'T' },
      { cmd: 'm4a1', name: 'M4A1', price: 3100, img: 'm4a1', team: 'CT' },
      { cmd: 'sg552', name: 'SG 552', price: 3500, img: 'sg552', team: 'T' },
      { cmd: 'aug', name: 'AUG', price: 3500, img: 'aug', team: 'CT' },
      { cmd: 'scout', name: 'Scout', price: 2750, img: 'scout' },
      { cmd: 'awp', name: 'AWP', price: 4750, img: 'awp' },
      { cmd: 'g3sg1', name: 'G3SG1', price: 5000, img: 'g3sg1', team: 'T' },
      { cmd: 'sg550', name: 'SG550', price: 4200, img: 'sg550', team: 'CT' },
    ],
  },
  {
    title: 'Súng máy',
    items: [{ cmd: 'm249', name: 'M249', price: 5750, img: 'm249' }],
  },
  {
    title: 'Trang bị',
    items: [
      { cmd: 'vesthelm', name: 'Giáp + mũ', price: 1000, img: 'kevlar_helmet' },
      { cmd: 'vest', name: 'Giáp', price: 650, img: 'kevlar' },
      { cmd: 'hegren', name: 'Lựu đạn HE', price: 300, img: 'hegrenade' },
      { cmd: 'flash', name: 'Lựu đạn choáng', price: 200, img: 'flashbang' },
      { cmd: 'sgren', name: 'Lựu đạn khói', price: 300, img: 'smokegrenade' },
      { cmd: 'defuser', name: 'Bộ gỡ bom', price: 200, img: 'defuser', team: 'CT' },
      { cmd: 'nvgs', name: 'Kính nhìn đêm', price: 1250, img: 'nightvision' },
      { cmd: 'shield', name: 'Khiên', price: 2200, img: 'shield', team: 'CT' },
    ],
  },
];

const CLASSES: Record<Team, { name: string; img: string }[]> = {
  T: [
    { name: 'Phoenix Connexion', img: 'terror' },
    { name: 'Angelina', img: 'angelina.jpg' },
    { name: 'Arctic Avengers', img: 'arctic' },
    { name: 'Guerilla Warfare', img: 'guerilla' },
  ],
  CT: [
    { name: 'Seal Team 6', img: 'urban' },
    { name: 'Choi Ji Yoon', img: 'choijiyoon.jpg' },
    { name: 'SAS', img: 'sas' },
    { name: 'GIGN', img: 'gign' },
  ],
};

type Score = {
  map: string;
  teams: Record<Team, number>;
  players: { name: string; team: string; kills: number; deaths: number; frags: number }[];
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function installOverlay(engine: Xash3DWebRTC, playerName: string) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const root = document.createElement('div');
  root.id = 'overlay';
  root.hidden = true;
  document.body.appendChild(root);

  const board = document.createElement('div');
  board.id = 'scoreboard';
  board.hidden = true;
  document.body.appendChild(board);

  let open: 'team' | 'class' | 'buy' | null = null;
  let myTeam: Team | null = null;
  let chatting = false;
  let hotkeys: ((n: number) => void) | null = null;

  const cmd = (c: string) => engine.Cmd_ExecuteString(c);
  // jointeam/joinclass không đóng menu chữ cũ của server. Bấm lại đúng số vừa chọn (slotN) để client
  // ẩn menu đó; server đã xử lý lệnh join trước nên lựa chọn không đổi.
  const clearTextMenu = (n: string | number) => window.setTimeout(() => cmd(`slot${n}`), 500);

  // Chặn chuột/phím trên menu đi xuống game.
  for (const ev of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu'] as const) {
    root.addEventListener(ev, (e) => e.stopPropagation());
  }

  function show(kind: 'team' | 'class' | 'buy', html: string, keys: (n: number) => void) {
    open = kind;
    hotkeys = keys;
    root.innerHTML = html;
    root.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function close(relock = true) {
    open = null;
    hotkeys = null;
    root.hidden = true;
    root.innerHTML = '';
    if (relock) canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  function panel(title: string, sub: string, body: string, wide = false) {
    return `<div class="ov-panel${wide ? ' wide' : ''}" role="dialog" aria-label="${esc(title)}">
      <header class="ov-head"><div><h2>${esc(title)}</h2><p>${sub}</p></div>
      <button class="ov-close" data-close aria-label="Đóng">Esc</button></header>${body}</div>`;
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-close],[data-team],[data-class],[data-buy]');
    if (!t) {
      if (e.target === root) close();
      return;
    }
    if (t.dataset.close !== undefined) close();
    else if (t.dataset.team) pickTeam(t.dataset.team);
    else if (t.dataset.class) pickClass(Number(t.dataset.class));
    else if (t.dataset.buy) buy(t.dataset.buy);
  });

  // ---- Chọn đội / nhân vật ----
  function openTeam() {
    const body = `<div class="ov-teams">
      <button class="team-card t" data-team="1"><img src="${UI}terror.png" alt=""><span><b>1</b> Scambodia</span><small>Đặt bom · giữ con tin</small></button>
      <button class="team-card ct" data-team="2"><img src="${UI}gign.png" alt=""><span><b>2</b> zSafety</span><small>Gỡ bom · giải cứu con tin</small></button>
    </div>
    <div class="ov-row">
      <button class="ov-btn" data-team="5"><b>5</b> Tự chọn đội</button>
      <button class="ov-btn ghost" data-team="6"><b>6</b> Xem (spectator)</button>
    </div>`;
    show('team', panel('Chọn đội', 'Bấm vào thẻ hoặc phím số', body), (n) => {
      if ([1, 2, 5, 6].includes(n)) pickTeam(String(n));
    });
  }

  function pickTeam(v: string) {
    cmd(`jointeam ${v}`);
    if (v === '1') myTeam = 'T';
    else if (v === '2') myTeam = 'CT';
    if (v === '1' || v === '2') openClass(myTeam!);
    else {
      if (v === '5') cmd('joinclass 5');
      clearTextMenu(v);
      close();
    }
  }

  function openClass(team: Team) {
    const cards = CLASSES[team]
      .map(
        (c, i) =>
          `<button class="class-card" data-class="${i + 1}"><img src="${UI}${c.img.includes('.') ? c.img : c.img + '.png'}" alt=""><span><b>${i + 1}</b> ${esc(c.name)}</span></button>`
      )
      .join('');
    const body = `<div class="ov-classes">${cards}</div>
      <div class="ov-row"><button class="ov-btn" data-class="5"><b>5</b> Ngẫu nhiên</button></div>`;
    show(
      'class',
      panel('Chọn nhân vật', team === 'T' ? 'Đội Scambodia' : 'Đội zSafety', body),
      (n) => {
        if (n >= 1 && n <= 5) pickClass(n);
      }
    );
  }

  function pickClass(n: number) {
    cmd(`joinclass ${n}`);
    clearTextMenu(n);
    close();
  }

  // ---- Mua súng ----
  function openBuy() {
    const team = myTeam ?? teamFromScore();
    let hot = 0;
    const hotMap = new Map<number, string>();
    const sections = BUY.map((g) => {
      const cards = g.items
        .map((it) => {
          const blocked = team && it.team && it.team !== team;
          const tag = it.team ? `<i class="tag ${it.team.toLowerCase()}">${it.team}</i>` : '';
          return `<button class="buy-card${blocked ? ' blocked' : ''}" data-buy="${it.cmd}" ${blocked ? 'disabled' : ''}>
            ${tag}<img src="${UI}${it.img}.png" alt="" loading="lazy"><span>${esc(it.name)}</span><em>$${it.price.toLocaleString('en-US')}</em></button>`;
        })
        .join('');
      return `<section><h3>${esc(g.title)}</h3><div class="buy-grid">${cards}</div></section>`;
    }).join('');
    const quick = `<div class="ov-row">
      <button class="ov-btn" data-buy="primammo"><b>${++hot}</b> Đạn súng chính</button>
      <button class="ov-btn" data-buy="secammo"><b>${++hot}</b> Đạn súng lục</button>
      <button class="ov-btn" data-buy="vesthelm"><b>${++hot}</b> Giáp + mũ</button>
      <button class="ov-btn ghost" data-close>Đóng (B / Esc)</button></div>`;
    hotMap.set(1, 'primammo').set(2, 'secammo').set(3, 'vesthelm');
    const sub = team
      ? `Đội ${team === 'T' ? 'Scambodia' : 'zSafety'} · phải đứng trong vùng mua, trong thời gian mua`
      : 'Phải đứng trong vùng mua, trong thời gian mua';
    show('buy', panel('Mua trang bị', sub, `<div class="buy-scroll">${sections}</div>${quick}`, true), (n) => {
      const c = hotMap.get(n);
      if (c) buy(c, false);
    });
  }

  function buy(c: string, closeAfter = c !== 'primammo' && c !== 'secammo') {
    cmd(c);
    if (closeAfter) close();
  }

  // ---- Bảng điểm ----
  let score: Score | null = null;
  const ping = new Map<string, number>();
  let boardTimer = 0;
  let statusAt = 0;

  // Dòng `rcon status`: " 0  <score> <ping> ... \t<name>\t<address>"
  onEnginePrint((line) => {
    const raw = line.replace(/^\[\d\d:\d\d:\d\d\]\s?/, '');
    const parts = raw.split('\t');
    if (parts.length < 3) return;
    const head = parts[0].trim().split(/\s+/);
    if (head.length < 3 || !/^\d+$/.test(head[0]) || !/^\d+$/.test(head[2])) return;
    ping.set(parts[parts.length - 2].trim(), Number(head[2]));
  });

  function teamFromScore(): Team | null {
    const me = score?.players.find((p) => p.name === playerName);
    return me?.team === 'T' || me?.team === 'CT' ? me.team : null;
  }

  async function refreshBoard() {
    try {
      const r = await fetch(`/live/score.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) score = (await r.json()) as Score;
    } catch {
      /* giữ dữ liệu cũ */
    }
    // Lấy ping 1 lần mỗi lần mở bảng (kết quả rcon cũng hiện vài dòng ở góc màn hình).
    if (!statusAt) {
      statusAt = Date.now();
      cmd('rcon status');
    }
    renderBoard();
  }

  function renderBoard() {
    const s = score;
    const rows = (team: string) =>
      (s?.players ?? [])
        .filter((p) => p.team === team)
        .map(
          (p) => `<tr class="${p.name === playerName ? 'me' : ''}"><td class="n">${esc(p.name)}</td>
          <td>${p.frags}</td><td>${p.deaths}</td><td class="p">${ping.get(p.name) ?? '–'}</td></tr>`
        )
        .join('') || `<tr class="empty"><td colspan="4">Chưa có ai</td></tr>`;
    const table = (team: Team, label: string) => `<div class="sb-team ${team.toLowerCase()}">
      <div class="sb-head"><span>${label}</span><strong>${s?.teams?.[team] ?? 0}</strong></div>
      <table><thead><tr><th class="n">Người chơi</th><th>Hạ</th><th>Chết</th><th>Ping</th></tr></thead>
      <tbody>${rows(team)}</tbody></table></div>`;
    const spec = (s?.players ?? []).filter((p) => p.team !== 'T' && p.team !== 'CT');
    board.innerHTML = `<div class="sb-panel">
      <header><h2>Bảng điểm</h2><span>${esc(s?.map || '')}</span></header>
      <div class="sb-cols">${table('CT', 'zSafety')}${table('T', 'Scambodia')}</div>
      ${spec.length ? `<footer>Đang xem: ${spec.map((p) => esc(p.name)).join(', ')}</footer>` : ''}
    </div>`;
  }

  function showBoard(on: boolean) {
    if (on === !board.hidden) return;
    board.hidden = !on;
    clearInterval(boardTimer);
    statusAt = 0;
    if (on) {
      renderBoard();
      void refreshBoard();
      boardTimer = window.setInterval(refreshBoard, 1000);
    }
  }

  // ---- Phím tắt (capture: chạy trước engine) ----
  window.addEventListener(
    'keydown',
    (e) => {
      if (!engine.running) return;
      const k = e.key.toLowerCase();

      if (open) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (k === 'escape' || (open === 'buy' && k === 'b') || (open === 'team' && k === 'm')) close();
        else if (/^[0-9]$/.test(k)) hotkeys?.(Number(k));
        return;
      }

      // Đang gõ chat: để phím đi thẳng vào game.
      if (chatting) {
        if (k === 'enter' || k === 'escape') chatting = false;
        return;
      }
      if (k === 'y' || k === 'u') {
        chatting = true;
        return;
      }

      if (k === 'tab') {
        e.stopImmediatePropagation();
        e.preventDefault();
        showBoard(true);
      } else if (k === 'b' && !e.repeat) {
        e.stopImmediatePropagation();
        e.preventDefault();
        openBuy();
      } else if (k === 'm' && !e.repeat) {
        e.stopImmediatePropagation();
        e.preventDefault();
        openTeam();
      }
    },
    true
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Tab') {
        e.stopImmediatePropagation();
        e.preventDefault();
        showBoard(false);
      } else if (open) {
        e.stopImmediatePropagation();
      }
    },
    true
  );

  // Server tự mở menu chọn đội (dạng chữ) khi mới vào: mở menu đẹp thay thế.
  cmd('rcon_password cs16lan');
  window.setTimeout(() => {
    if (!open && !myTeam && !teamFromScore()) openTeam();
  }, 4000);

  return { openTeam, openBuy, showBoard };
}
