#!/bin/bash
# Khởi động lại server CS (image ghcr) với IP mạng hiện tại. Không cần Internet.
# Dùng: ./restart-ghcr.sh               (tự tìm IP, client engine 1.2.2)
#       ./restart-ghcr.sh 192.168.1.5   (chỉ định IP)
#       MAP=de_inferno ./restart-ghcr.sh (đổi map lúc khởi động, mặc định de_dust2)
#       CLIENT=old ./restart-ghcr.sh     (quay về client cũ của image, engine 1.0.x)
cd "$(dirname "$0")"

IP="$1"
if [ -z "$IP" ]; then
  # Interface của route mặc định (Wi-Fi hoặc dây LAN), bỏ qua VPN utun*.
  IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  case "$IF" in utun*|"") IF="" ;; esac
  [ -n "$IF" ] && IP=$(ipconfig getifaddr "$IF" 2>/dev/null)
  # Không có route mặc định (LAN không có Internet): lấy IPv4 đầu tiên của en*.
  if [ -z "$IP" ]; then
    for i in $(ifconfig -l); do
      case "$i" in en*) IP=$(ipconfig getifaddr "$i" 2>/dev/null); [ -n "$IP" ] && { IF=$i; break; } ;; esac
    done
  fi
fi
[ -n "$IP" ] || { echo "✗ Không tìm thấy IP. Cắm mạng rồi chạy lại, hoặc: ./restart-ghcr.sh <IP>"; exit 1; }
export IP

FILES=(-f docker-compose.ghcr.yml)
if [ "${CLIENT:-new}" != "old" ]; then FILES+=(-f docker-compose.122.yml); fi

echo "IP: $IP ${IF:+($IF)}  client: ${CLIENT:-new}  map: ${MAP:-de_dust2}"
# down rồi up (không dùng --force-recreate). Docker Desktop đôi khi không mở lại
# UDP 27018 sau khi tạo lại container liên tục: kiểm tra và thử lại vài lần.
for try in 1 2 3 4; do
  docker compose "${FILES[@]}" down >/dev/null 2>&1
  sleep $((try * 2))
  docker compose "${FILES[@]}" up -d || exit 1
  sleep 3
  lsof -nP -iUDP:27018 >/dev/null 2>&1 && break
  echo "  UDP 27018 chưa mở, thử lại ($try)..."
done

for _ in $(seq 1 30); do
  curl -fsS -m 2 -o /dev/null "http://$IP:27016/" 2>/dev/null && break
  sleep 1
done

echo ""
docker logs --tail 1 cs16-web-server 2>&1
echo "Server IP: $(docker exec cs16-web-server sh -c 'echo $IP')"
if ! lsof -nP -iUDP:27018 >/dev/null 2>&1; then
  echo "  ⚠ UDP 27018 chưa mở (người chơi sẽ kẹt sau khi bấm Play). Chạy lại script này."
fi
echo ""
echo "  Link cho người chơi:  http://$IP:27016"
echo "  Người chơi kiểm tra:  nc -vz -w 3 $IP 27016"
echo ""
netstat -rn -f inet | grep -q utun && echo "  ⚠ VPN đang bật: nên tắt nếu người chơi khác dải mạng."
