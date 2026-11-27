#!/bin/sh
# Build lại client web (web-ghcr-122/) từ mã nguồn trong web-ghcr-122/src, chạy trong Docker (node:24).
#
# Các bước:
#  1. Dựng lại cây thư mục vite (src/client/...) trong thư mục tạm.
#  2. npm install (xash3d-fwgs@1.2.2: engine + renderer webgl2).
#  3. Vá engine: bản npm có số build = -1 nên host_ver là "-1 0.21 ...". Client CS (cs16-client 0.0.2)
#     đọc số này và đòi >= 4190, nếu không thì báo "Xash3D version check failed".
#     Đổi chuỗi định dạng "%i 0.21 %s %s %s" -> "9999%c %s %s %s " (cùng độ dài).
#  4. vite build, chép index.html + assets vào web-ghcr-122/.
#
# Thư viện CS (src/cs/*.wasm, *.so) lấy từ image ghcr.io/balintsoos/cs16-web-server vì cs16-client
# đã bị gỡ khỏi npm. client_emscripten_wasm32.wasm đã được vá sẵn tên phe (zSafety / Scambodia).
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/web-ghcr-122/src"
OUT="$ROOT/web-ghcr-122"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/src/client"
cp "$SRC/package.json" "$SRC/tsconfig.json" "$SRC/vite.config.ts" "$WORK/"
cp -R "$SRC/client-src" "$WORK/src/client/src"
cp -R "$SRC/cs" "$SRC/public" "$SRC/index.html" "$WORK/src/client/"

docker run --rm -v "$WORK":/app -w /app node:24-alpine sh -c '
  npm install --no-audit --no-fund --ignore-scripts >/dev/null &&
  node -e "
    const fs = require(\"fs\");
    const p = \"node_modules/xash3d-fwgs/dist/xash.wasm\";
    const b = fs.readFileSync(p);
    const from = Buffer.from(\"%i 0.21 %s %s %s\\0\", \"latin1\");
    const to = Buffer.from(\"9999%c %s %s %s \\0\", \"latin1\");
    const i = b.indexOf(from);
    if (i < 0 && b.indexOf(to) < 0) { console.error(\"Không thấy chuỗi host_ver trong xash.wasm\"); process.exit(1); }
    if (i >= 0) { to.copy(b, i); fs.writeFileSync(p, b); }
  " &&
  npm run build
'

# Thay bản build cũ. Giữ index-D_oQDsUs.js: file giữ chỗ cho mount của docker-compose.ghcr.yml.
find "$OUT/assets" -name "index-*" ! -name "index-D_oQDsUs.js" -delete
cp "$WORK/src/client/dist/index.html" "$OUT/index.html"
cp "$WORK"/src/client/dist/assets/* "$OUT/assets/"
echo "Xong: $OUT (người chơi bấm F5 để nhận bản mới)"
