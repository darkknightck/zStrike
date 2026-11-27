#!/bin/sh
# Chạy server CS và tắt hẳn khi engine crash, để Docker (restart: unless-stopped) khởi động lại.
#
# Lý do: server của image balintsoos đôi khi crash ("double free or corruption") khi ngắt một
# người chơi bị mất kết nối (quá thời gian chờ). Sau khi crash, trình xử lý lỗi của engine treo,
# tiến trình không thoát, nên Docker không tự khởi động lại và server đứng im mãi.
cd /xashds || exit 1

FIFO=/tmp/xash.log
rm -f "$FIFO"
mkfifo "$FIFO" || exit 1

./xash +ip 0.0.0.0 -port 27015 -game cstrike "$@" >"$FIFO" 2>&1 &
PID=$!

# Chuyển log ra stdout (docker logs) và theo dõi dấu hiệu crash.
while IFS= read -r line; do
  printf '%s\n' "$line"
  case "$line" in
    *"double free or corruption"* | *"Crash: signal"* | *"uncaught target signal"*)
      echo "watchdog: engine crash, dừng tiến trình để Docker khởi động lại server"
      kill -9 "$PID" 2>/dev/null
      exit 1
      ;;
  esac
done <"$FIFO"

wait "$PID"
exit $?
