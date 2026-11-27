#!/usr/bin/env python3
"""Tạo lại các gói dữ liệu không có trong repo (nội dung có bản quyền / quá nặng).

  python3 scripts/build_packs.py game              # web-ghcr/gamefiles-mansion.zip + gamefiles-lite.zip
  python3 scripts/build_packs.py ui                # web-ghcr-122/ui/*.png (ảnh súng / nhân vật cho menu)
  python3 scripts/build_packs.py custom            # custom/cstrike/{titles.txt,resource/...} + web-ghcr/custom-pack.zip
  python3 scripts/build_packs.py hd <pack.7z>      # web-ghcr/hd-pack.zip từ "Ultimate HD Pack by ralex" (tuỳ chọn)
  python3 scripts/build_packs.py all               # game + ui + custom

Cần: Docker (game), macOS `sips` (ui, hd). File đầu ra được ghi đè tại chỗ (giữ inode) để
container đang mount vẫn thấy bản mới.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE = "ghcr.io/balintsoos/cs16-web-server:latest"
# PACK_OUT: ghi gói ra thư mục khác (vd. để thử, không đụng file server đang dùng)
WEB = os.environ.get("PACK_OUT") or os.path.join(ROOT, "web-ghcr")
UI = os.environ.get("UI_OUT") or os.path.join(ROOT, "web-ghcr-122", "ui")
CUSTOM = os.path.join(ROOT, "custom")
FULL = os.path.join(WEB, "gamefiles-mansion.zip")
LITE = os.path.join(WEB, "gamefiles-lite.zip")

# Bỏ khỏi gói rút gọn: map/video/overview của Half-Life, thư viện native (trình duyệt dùng bản wasm).
# GIỮ toàn bộ valve/sound: map CS dùng âm thanh môi trường của HL (vd. dust2: ambience/quail1.wav);
# thiếu thì client phải tải từ server qua kênh game, rất chậm, trông như bị treo.
LITE_EXCLUDE = re.compile(
    r"\.(so|dll|exe|dylib)$|^valve/dlls/|/logs/|^valve/maps/|^valve/media/|^valve/overviews/"
    r"|^cstrike/dlls/|^cstrike/cl_dlls/|^valve/cl_dlls/",
    re.I,
)

VGUI = (
    "ak47 arctic aug awp ct_random defuser deserteagle elites famas fiveseven flashbang g3sg1 galil "
    "gign glock18 gsg9 guerilla hegrenade kevlar kevlar_helmet leet m249 m3 m4a1 mac10 mp5 nightvision "
    "p228 p90 sas scout sg550 sg552 shield smokegrenade t_random terror tmp ump45 urban usp45 vip xm1014"
).split()


def run(*cmd, **kw):
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def write_in_place(src, dst):
    """Ghi đè giữ nguyên inode: bind mount của Docker vẫn trỏ đúng file."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        shutil.copyfileobj(fi, fo, 1 << 20)
    os.remove(src)


def build_game():
    """gamefiles.zip trong image + cs_mansion.bsp -> bản đầy đủ (client cũ) và bản rút gọn."""
    with tempfile.TemporaryDirectory() as tmp:
        cid = subprocess.check_output(["docker", "create", "--platform", "linux/386", IMAGE], text=True).strip()
        try:
            run("docker", "cp", f"{cid}:/xashds/public/gamefiles.zip", os.path.join(tmp, "base.zip"))
        finally:
            subprocess.run(["docker", "rm", "-f", cid], capture_output=True)

        full_tmp = FULL + ".new"
        shutil.copyfile(os.path.join(tmp, "base.zip"), full_tmp)
        with zipfile.ZipFile(full_tmp, "a", zipfile.ZIP_DEFLATED) as z:
            if "cstrike/maps/cs_mansion.bsp" not in z.namelist():
                z.write(os.path.join(ROOT, "custom-maps", "cs_mansion.bsp"), "cstrike/maps/cs_mansion.bsp")
        write_in_place(full_tmp, FULL)
        print("->", FULL)

    lite_tmp = LITE + ".new"
    kept = skipped = 0
    with zipfile.ZipFile(FULL) as zi, zipfile.ZipFile(lite_tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zo:
        for info in zi.infolist():
            if info.is_dir():
                continue
            if LITE_EXCLUDE.search(info.filename):
                skipped += 1
                continue
            zo.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), zi.read(info),
                        compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
            kept += 1
    write_in_place(lite_tmp, LITE)
    print(f"-> {LITE} (giữ {kept} file, bỏ {skipped})")


def build_ui():
    """Ảnh súng / nhân vật (gfx/vgui/*.tga) -> PNG cho menu HTML. Ưu tiên bản HD nếu có HD_VGUI_DIR."""
    if not shutil.which("sips"):
        sys.exit("Cần macOS `sips` để đổi TGA -> PNG (hoặc tự chuyển bằng ImageMagick).")
    os.makedirs(UI, exist_ok=True)
    hd_dir = os.environ.get("HD_VGUI_DIR", "")
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(LITE) as z:
        for name in VGUI:
            src = os.path.join(hd_dir, f"{name}.tga") if hd_dir else ""
            if not os.path.isfile(src):
                member = f"cstrike/gfx/vgui/{name}.tga"
                try:
                    data = z.read(member)
                except KeyError:
                    print("thiếu", member)
                    continue
                src = os.path.join(tmp, f"{name}.tga")
                with open(src, "wb") as f:
                    f.write(data)
            subprocess.run(["sips", "-s", "format", "png", src, "--out", os.path.join(UI, f"{name}.png")],
                           check=True, capture_output=True)
    print("->", UI, "(ảnh Angelina / Choi Ji Yoon: tự chép angelina.jpg, choijiyoon.jpg vào đây)")


def build_custom():
    """Đổi tên phe (titles.txt, cstrike_english.txt) rồi đóng gói custom/cstrike -> custom-pack.zip."""
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(LITE) as z:
        en = os.path.join(tmp, "cstrike_english.txt")
        ti = os.path.join(tmp, "titles.txt")
        with open(en, "wb") as f:
            f.write(z.read("cstrike/resource/cstrike_english.txt"))
        with open(ti, "wb") as f:
            f.write(z.read("cstrike/titles.txt"))
        run(sys.executable, os.path.join(CUSTOM, "rename_teams.py"), en, ti, os.path.join(CUSTOM, "cstrike"))

    for mdl in ("leet/leet.mdl", "gsg9/gsg9.mdl"):
        if not os.path.isfile(os.path.join(CUSTOM, "cstrike", "models", "player", mdl)):
            print(f"chú ý: chưa có custom/cstrike/models/player/{mdl} (xem custom/README.txt)")

    out = os.path.join(WEB, "custom-pack.zip")
    tmp_zip = out + ".new"
    base = os.path.join(CUSTOM, "cstrike")
    with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zo:
        for dirpath, _, files in os.walk(base):
            for fn in files:
                p = os.path.join(dirpath, fn)
                zo.write(p, os.path.relpath(p, CUSTOM))
    write_in_place(tmp_zip, out)
    print("->", out)


def _width(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", path], capture_output=True, text=True).stdout
    m = re.search(r"pixelWidth:\s*(\d+)", out)
    return int(m.group(1)) if m else 0


def build_hd(archive):
    """Lọc "Ultimate HD Pack by ralex" thành hd-pack.zip chỉ gồm thứ dùng được an toàn trên web.

    Lấy: model thay thế (trừ model nhân vật), âm thanh thay thế, bầu trời của các map có sẵn,
    detail textures (thu về 256 px) cho các map có sẵn.
    Bỏ: WAD (đổi kích thước texture -> sai tỉ lệ), BSP (lệch map với server), sprites và model
    nhân vật (server kiểm tra nguyên vẹn), mọi file chạy được (.exe/.dll/.bat/.amxx).
    """
    if not shutil.which("sips"):
        sys.exit("Cần macOS `sips` để thu nhỏ detail textures.")
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(LITE) as z:
        run("tar", "-xf", archive, "-C", tmp, "--exclude", "*.exe", "--exclude", "*.dll",
            "--exclude", "*.bat", "--exclude", "*.amxx", "--exclude", "*.rar")
        roots = [os.path.join(tmp, d) for d in os.listdir(tmp)]
        root = next((r for r in roots if os.path.isdir(os.path.join(r, "cstrike"))), tmp)
        stock = {n.lower(): n for n in z.namelist()}
        maps = sorted({os.path.basename(n)[:-4] for n in stock if re.match(r"cstrike/maps/[^/]+\.bsp$", n)})

        # Tên bầu trời mỗi map dùng (đọc entity lump của BSP).
        skies = set()
        for m in maps:
            data = z.read(stock[f"cstrike/maps/{m}.bsp"])
            off, ln = int.from_bytes(data[4:8], "little"), int.from_bytes(data[8:12], "little")
            found = re.search(rb'"skyname"\s+"([^"]+)"', data[off:off + ln])
            skies.add(found.group(1).decode().lower() if found else "desert")

        picked = []
        for dirpath, _, files in os.walk(root):
            for fn in files:
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, root).replace(os.sep, "/")
                low = rel.lower()
                replaces = low in stock
                if replaces and re.match(r"cstrike/models/", low) and not re.match(r"cstrike/models/(player/|player\.mdl)", low):
                    picked.append(rel)
                elif replaces and re.match(r"(cstrike|valve)/sound/", low):
                    picked.append(rel)
                elif re.match(r"(cstrike|valve)/gfx/env/", low):
                    sky = re.match(r".*/gfx/env/(.+?)(up|dn|lf|rt|ft|bk)\.tga$", low)
                    if sky and sky.group(1) in skies:
                        picked.append(rel)

        # Detail textures cho map có sẵn.
        detail_dir = os.path.join(root, "cstrike", "maps")
        for m in maps:
            txt = next((f for f in os.listdir(detail_dir) if f.lower() == f"{m}_detail.txt"), None) if os.path.isdir(detail_dir) else None
            if not txt:
                continue
            picked.append(f"cstrike/maps/{txt}")
            for line in open(os.path.join(detail_dir, txt), encoding="latin-1"):
                parts = line.split()
                if len(parts) >= 2:
                    tga = f"cstrike/gfx/{parts[1]}.tga".lower()
                    for dirpath, _, files in os.walk(os.path.join(root, "cstrike", "gfx")):
                        for fn in files:
                            rel = os.path.relpath(os.path.join(dirpath, fn), root).replace(os.sep, "/")
                            if rel.lower() == tga:
                                picked.append(rel)

        out = os.path.join(WEB, "hd-pack.zip")
        tmp_zip = out + ".new"
        with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zo:
            for rel in sorted(set(picked)):
                src = os.path.join(root, rel)
                if "/gfx/detail/" in rel.lower() and _width(src) > 256:
                    small = os.path.join(tmp, "detail.tga")
                    subprocess.run(["sips", "-s", "format", "tga", "-Z", "256", src, "--out", small],
                                   check=True, capture_output=True)
                    src = small
                zo.write(src, rel)
        write_in_place(tmp_zip, out)
        print(f"-> {out} ({len(set(picked))} file)")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "game":
        build_game()
    elif cmd == "ui":
        build_ui()
    elif cmd == "custom":
        build_custom()
    elif cmd == "hd":
        if len(sys.argv) < 3:
            sys.exit("Dùng: build_packs.py hd <ultimate_hd_pack.7z>")
        build_hd(sys.argv[2])
    elif cmd == "all":
        build_game()
        build_ui()
        build_custom()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
