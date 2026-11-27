import { loadAsync } from 'jszip';
import { createStore, del, get, set } from 'idb-keyval';

// Gói game rút gọn (bỏ nội dung Half-Life CS không dùng) + cs_mansion.
export const GAME_PACK = 'gamefiles-lite.zip';
// Gói HD tải riêng: model súng, bầu trời, detail textures.
export const HD_PACK = 'hd-pack.zip';
// Model tuỳ chỉnh (luôn tải, cả khi tắt HD): server có cùng file, lệch file thì server crash.
export const CUSTOM_PACK = 'custom-pack.zip';

// IndexedDB giới hạn ~127 MB mỗi giá trị, nên lưu thành từng khúc 32 MB.
const CHUNK = 32 * 1024 * 1024;
const store = createStore('cs16-cache', 'packs');

type Meta = { version: string; size: number; chunks: number };
export type Progress = (loaded: number, total: number, fromCache: boolean) => void;

async function readCache(url: string, version: string): Promise<ArrayBuffer | null> {
  try {
    const meta = await get<Meta>(`${url}:meta`, store);
    if (!meta || meta.version !== version) return null;
    const out = new Uint8Array(meta.size);
    for (let i = 0; i < meta.chunks; i++) {
      const part = await get<ArrayBuffer>(`${url}:${i}`, store);
      if (!part) return null;
      out.set(new Uint8Array(part), i * CHUNK);
    }
    return out.buffer;
  } catch {
    return null;
  }
}

async function writeCache(url: string, version: string, data: Uint8Array) {
  try {
    const old = await get<Meta>(`${url}:meta`, store);
    await del(`${url}:meta`, store); // xoá meta trước: lỡ dừng giữa chừng thì cache coi như không có
    if (old) for (let i = 0; i < old.chunks; i++) await del(`${url}:${i}`, store);
    const chunks = Math.ceil(data.byteLength / CHUNK);
    for (let i = 0; i < chunks; i++) {
      await set(`${url}:${i}`, data.slice(i * CHUNK, (i + 1) * CHUNK).buffer, store);
    }
    await set(`${url}:meta`, { version, size: data.byteLength, chunks } satisfies Meta, store);
  } catch (e) {
    console.warn(`cache skipped for ${url}:`, e);
  }
}

async function download(url: string, onProgress: Progress): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const out = new Uint8Array(total);
  const reader = response.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, loaded);
    loaded += value.byteLength;
    onProgress(loaded, total, false);
  }
  return loaded === total ? out : out.slice(0, loaded);
}

// Tải 1 gói, ưu tiên bản đã lưu nếu phiên bản (kích thước + ngày sửa) còn khớp với server.
export async function loadPack(url: string, onProgress: Progress) {
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!head.ok) throw new Error(`${url}: HTTP ${head.status}`);
  const size = Number(head.headers.get('content-length')) || 0;
  const version = `${size}-${head.headers.get('last-modified') ?? ''}`;

  const cached = await readCache(url, version);
  if (cached) {
    onProgress(size, size, true);
    return loadAsync(cached);
  }
  const data = await download(url, onProgress);
  // Không chờ ghi cache để vào game ngay.
  void writeCache(url, version, data);
  return loadAsync(data.buffer as ArrayBuffer);
}

export function hdEnabled(): boolean {
  const q = new URLSearchParams(location.search).get('hd');
  if (q === '0') return false;
  if (q === '1') return true;
  try {
    return localStorage.getItem('cs16-hd') !== '0';
  } catch {
    return true;
  }
}

export function setHdEnabled(on: boolean) {
  try {
    localStorage.setItem('cs16-hd', on ? '1' : '0');
  } catch {
    /* bỏ qua */
  }
}
