import { createEngine } from './engine';
import { CUSTOM_PACK, GAME_PACK, HD_PACK, hdEnabled, loadPack, setHdEnabled } from './gamefiles';
import { mb, removeDesktop, setReady, updateProgress, updateStatus } from './desktop';
import { cachePlayerName, getPlayerName } from './player';
import type { Xash3DWebRTC } from './webrtc';
import extrasURL from 'xash3d-fwgs/extras.pk3?url';
import type JSZip from 'jszip';
import { installOverlay } from './overlay';

declare global {
  interface Window {
    __xash?: Xash3DWebRTC;
  }
}

const playButton = document.getElementById('play-button') as HTMLButtonElement;
const joinForm = document.getElementById('join-form') as HTMLFormElement;
const hdToggle = document.getElementById('hd-toggle') as HTMLInputElement;

const useHd = hdEnabled();
hdToggle.checked = useHd;
hdToggle.addEventListener('change', () => {
  setHdEnabled(hdToggle.checked);
  // Gói HD được nạp lúc mở trang, nên đổi lựa chọn thì tải lại trang.
  const url = new URL(location.href);
  url.searchParams.delete('hd');
  location.replace(url);
});

async function initApp() {
  try {
    const engine = createEngine();
    window.__xash = engine; // để gửi lệnh vào game từ trình duyệt (debug, chọn map)
    await initEngine(engine);
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!playButton.disabled) start(engine);
    });
    playButton.disabled = false;
    setReady();
    updateStatus('Sẵn sàng', 'Nhập tên rồi bấm Chơi');
    playButton.focus();
  } catch (error) {
    console.error('Failed to load game:', error);
    updateStatus('Không tải được game', 'Tải lại trang để thử lại');
  }
}

// Tiến độ tải gộp của các gói (byte).
const packs = new Map<string, { loaded: number; total: number; cached: boolean }>();
function reportDownload() {
  let loaded = 0;
  let total = 0;
  let allCached = true;
  for (const p of packs.values()) {
    loaded += p.loaded;
    total += p.total;
    allCached &&= p.cached;
  }
  updateProgress(loaded, total);
  if (allCached && total > 0) updateStatus('Đọc dữ liệu đã lưu trên máy…', mb(total));
  else updateStatus('Đang tải dữ liệu game…', total ? `${mb(loaded)} / ${mb(total)}` : mb(loaded));
}

function track(url: string) {
  packs.set(url, { loaded: 0, total: 0, cached: false });
  return (loaded: number, total: number, cached: boolean) => {
    packs.set(url, { loaded, total, cached });
    reportDownload();
  };
}

async function writeZip(
  engine: Xash3DWebRTC,
  zip: JSZip,
  label: string,
  rename: (name: string) => string = (n) => n
) {
  const entries = Object.entries(zip.files).filter(([, f]) => !f.dir);
  let done = 0;
  for (const [name, file] of entries) {
    const path = '/rodir/' + rename(name);
    engine.em!.FS.mkdirTree(path.split('/').slice(0, -1).join('/'));
    engine.em!.FS.writeFile(path, await file.async('uint8array'));
    done += 1;
    if (done % 100 === 0 || done === entries.length) {
      updateProgress(done, entries.length);
      updateStatus(label, `${done} / ${entries.length} file`);
    }
  }
}

async function initEngine(engine: Xash3DWebRTC): Promise<void> {
  updateStatus('Đang khởi động engine…');
  const [gamefiles, , extras, hd, custom] = await Promise.all([
    loadPack(GAME_PACK, track(GAME_PACK)),
    engine.init(),
    fetch(extrasURL).then((r) => r.arrayBuffer()),
    useHd
      ? loadPack(HD_PACK, track(HD_PACK)).catch((e) => {
          console.warn('HD pack skipped:', e);
          return null;
        })
      : Promise.resolve(null),
    loadPack(CUSTOM_PACK, track(CUSTOM_PACK)).catch((e) => {
      console.warn('custom pack skipped:', e);
      return null;
    }),
  ]);

  await writeZip(engine, gamefiles, 'Đang giải nén dữ liệu game…');

  // Gói HD ghi đè file gốc; giữ đúng chữ hoa/thường của file gốc để không sinh 2 bản trùng tên.
  if (hd) {
    const original = new Map(Object.keys(gamefiles.files).map((n) => [n.toLowerCase(), n]));
    await writeZip(engine, hd, 'Đang nạp gói HD…', (n) => original.get(n.toLowerCase()) ?? n);
  }

  // Model tuỳ chỉnh (vd. Angelina thay Elite Crew) ghi đè sau cùng.
  if (custom) {
    const original = new Map(Object.keys(gamefiles.files).map((n) => [n.toLowerCase(), n]));
    await writeZip(engine, custom, 'Đang nạp model tuỳ chỉnh…', (n) => original.get(n.toLowerCase()) ?? n);
  }

  // Font + tài nguyên menu của engine 1.2.2 (menu Esc)
  engine.em!.FS.mkdirTree('/rodir/valve');
  engine.em!.FS.writeFile('/rodir/valve/extras.pk3', new Uint8Array(extras));
  engine.em!.FS.chdir('/rodir');
}

function start(engine: Xash3DWebRTC): void {
  const playerName = getPlayerName() || 'Player';
  cachePlayerName(playerName);
  removeDesktop();

  engine.main();
  engine.Cmd_ExecuteString('_vgui_menus 0');
  // Đồ hoạ: map tối dễ nhìn hơn
  engine.Cmd_ExecuteString('brightness 2');
  engine.Cmd_ExecuteString('gl_overbright 1');
  // Detail textures chỉ có trong gói HD (maps/<map>_detail.txt)
  engine.Cmd_ExecuteString(`r_detailtextures ${useHd ? 1 : 0}`);
  if (!window.matchMedia('(hover: hover)').matches) {
    engine.Cmd_ExecuteString('touch_enable 1');
  }
  engine.Cmd_ExecuteString(`name "${playerName.replace(/"/g, '')}"`);
  engine.Cmd_ExecuteString('connect 127.0.0.1:8080');

  // Menu đẹp: chọn đội/nhân vật (M), mua súng (B), bảng điểm (Tab)
  installOverlay(engine, playerName.replace(/"/g, ''));

  // Server crash khi phải ngắt người chơi bị mất kết nối (quá thời gian chờ). Tránh bằng cách
  // luôn thoát đàng hoàng: khi đóng tab, và khi tab bị ẩn lâu (trình duyệt dừng game ở tab nền).
  let hiddenTimer = 0;
  let leftWhileHidden = false;
  window.addEventListener('pagehide', () => engine.Cmd_ExecuteString('disconnect'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenTimer = window.setTimeout(() => {
        engine.Cmd_ExecuteString('disconnect');
        leftWhileHidden = true;
      }, 45_000);
    } else {
      clearTimeout(hiddenTimer);
      if (leftWhileHidden) {
        leftWhileHidden = false;
        engine.Cmd_ExecuteString('connect 127.0.0.1:8080');
      }
    }
  });

  window.addEventListener('beforeunload', (event) => {
    event.preventDefault();
    event.returnValue = '';
    return '';
  });
}

initApp();
