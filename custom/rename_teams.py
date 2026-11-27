"""Đổi tên 2 phe trong chuỗi hiển thị của client CS: CT -> zSafety, T -> Scambodia.

Chỉ thay phần giá trị (chuỗi thứ 2 trên mỗi dòng), giữ nguyên khoá. Chạy lại khi đổi tên:
  python3 custom/rename_teams.py <cstrike_english.txt gốc> <titles.txt gốc> custom/cstrike
"""
import os
import re
import sys

CT, T = "zSafety", "Scambodia"
RULES = [
    (r"Counter-Terroris?ts?\b|Counter-Terrorits\b|counter-terroris?ts?\b", CT),
    (r"\bCT FORCES\b", CT.upper()),
    (r"\bCT Forces\b|\bCT Model Selection\b", lambda m: m.group(0).replace("CT", CT)),
    (r"\bTERRORIST FORCES\b", T.upper()),
    (r"\b[Tt]errorists?\b", T),
    (r"\b([Tt]he) CT team\b", lambda m: f"{m.group(1)} {CT} team"),
    (r"\ba CT\b", f"a {CT}"),
]


def rename(text: str) -> str:
    for pat, rep in RULES:
        text = re.sub(pat, rep, text)
    return text


def convert_lines(text: str) -> str:
    out = []
    for line in text.splitlines(keepends=True):
        m = re.match(r'^(\s*"[^"]*"\s+)(.*)$', line, re.S)
        if m and m.group(2).lstrip().startswith('"'):
            out.append(m.group(1) + rename(m.group(2)))  # "khoá"  "giá trị"
        elif re.match(r'^\s*"[^"\s]*"\s*$', line) or re.match(r"^\s*(//|\{|\}|[A-Za-z0-9_]+\s*$)", line):
            out.append(line)  # dòng chỉ có khoá / chú thích / ngoặc
        else:
            out.append(rename(line))  # dòng tiếp nối của chuỗi nhiều dòng
    return "".join(out)


def main(english, titles, outdir):
    raw = open(english, "rb").read()
    text = raw.decode("utf-16")
    os.makedirs(os.path.join(outdir, "resource"), exist_ok=True)
    with open(os.path.join(outdir, "resource", "cstrike_english.txt"), "wb") as f:
        f.write(convert_lines(text).encode("utf-16"))  # giữ UTF-16 có BOM như file gốc

    t = open(titles, encoding="latin-1").read()
    with open(os.path.join(outdir, "titles.txt"), "w", encoding="latin-1", newline="") as f:
        f.write(convert_titles(t))


def convert_titles(t: str) -> str:
    # titles.txt: tên khoá đứng 1 dòng, nội dung trong { }. Chỉ đổi nội dung trong ngoặc.
    out, inside = [], False
    for line in t.splitlines(keepends=True):
        s = line.strip()
        if s == "{":
            inside = True
        elif s == "}":
            inside = False
        elif inside:
            line = line.replace("Counter-Terrorist Force", CT).replace("Terrorist Force", T)
            line = rename(line)
        out.append(line)
    return "".join(out)


if __name__ == "__main__":
    main(*sys.argv[1:4])
