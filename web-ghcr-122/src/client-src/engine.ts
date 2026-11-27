import filesystemURL from 'xash3d-fwgs/filesystem_stdio.wasm?url';
import xashURL from 'xash3d-fwgs/xash.wasm?url';
import menuURL from 'xash3d-fwgs/cl_dll/menu_emscripten_wasm32.wasm?url';
import webgl2URL from 'xash3d-fwgs/libref_webgl2.wasm?url';
// Thư viện CS (client/server) lấy từ image ghcr balintsoos, vì cs16-client đã bị gỡ khỏi npm.
import clientURL from '../cs/client_emscripten_wasm32.wasm?url';
import serverURL from '../cs/cs_emscripten_wasm32.so?url';
import { Xash3DWebRTC } from './webrtc';
import { updateStatus } from './desktop';

// Engine 1.2.2 nạp game dll theo tên dlls/cs_emscripten_wasm32.wasm (bản cũ: .so).
const CS_SERVER = 'dlls/cs_emscripten_wasm32.wasm';

// Cho phần khác (bảng điểm) đọc log console của engine, ví dụ kết quả `rcon status`.
const printListeners = new Set<(line: string) => void>();
export function onEnginePrint(fn: (line: string) => void) {
  printListeners.add(fn);
  return () => printListeners.delete(fn);
}
const emit = (line: string) => printListeners.forEach((fn) => fn(line));

export function createEngine(): Xash3DWebRTC {
  updateStatus('Initializing game engine...');
  return new Xash3DWebRTC({
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    renderer: 'gles3compat',
    // Đặt ở cấp trên (không trong module) để engine giữ được tham số -ref webgl2.
    arguments: ['-windowed', '-game', 'cstrike'],
    libraries: {
      filesystem: filesystemURL,
      xash: xashURL,
      menu: menuURL,
      client: clientURL,
      render: {
        gles3compat: webgl2URL,
      },
    },
    filesMap: {
      [CS_SERVER]: serverURL,
      'dlls/cs_emscripten_wasm32.so': serverURL,
      '/rwdir/filesystem_stdio.so': filesystemURL,
    },
    module: {
      print: (l: string) => {
        console.log(l);
        emit(l);
      },
      printErr: (l: string) => console.warn(l),
      // Thay danh sách mặc định (có dlls/hl_emscripten_wasm32.wasm của Half-Life) bằng dll của CS.
      dynamicLibraries: [
        'filesystem_stdio.wasm',
        'cl_dlls/menu_emscripten_wasm32.wasm',
        CS_SERVER,
        'cl_dlls/client_emscripten_wasm32.wasm',
        'libref_webgl2.wasm',
      ],
    },
  });
}
