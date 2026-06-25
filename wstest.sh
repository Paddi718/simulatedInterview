#!/bin/bash
echo "===== A. 服务器连自己域名(带错误) ====="
curl -sv --max-time 10 https://moniiv.cloud/ -o /tmp/idx.html 2>&1 | tail -15
ls -l /tmp/idx.html 2>&1

echo ""
echo "===== B. 直连本机nginx 443 首页 ====="
curl -s --max-time 10 -k https://127.0.0.1/ -o /tmp/idx2.html 2>&1
ls -l /tmp/idx2.html 2>&1
echo "首页引用的JS:"
grep -oE '/_next/static[^"]+\.js' /tmp/idx2.html 2>/dev/null | head -8 > /tmp/jslist.txt
cat /tmp/jslist.txt

echo ""
echo "===== C. 各JS中的ws字面量 ====="
while read js; do
  [ -z "$js" ] && continue
  url="https://127.0.0.1${js}"
  cnt=$(curl -s -k --max-time 10 "$url" | grep -c 'ws://localhost' 2>/dev/null)
  echo "$js  wslocalhost=$cnt"
  curl -s -k --max-time 10 "$url" 2>/dev/null | grep -oE 'ws://localhost[0-9:]*|wss://[a-zA-Z0-9.:-]+' | sort -u
done < /tmp/jslist.txt

echo ""
echo "===== D. WS握手(经本机nginx 443, -k忽略证书) ====="
curl -s -k --max-time 10 -o /dev/null -w "HANDSHAKE=%{http_code}\n" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "https://127.0.0.1/api/ws/interview/00000000-0000-0000-0000-000000000000?token=invalid" 2>&1

echo ""
echo "===== E. WS握手(直连后端8000, 绕开nginx) ====="
curl -s --max-time 10 -o /dev/null -w "BACKEND_HANDSHAKE=%{http_code}\n" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "http://127.0.0.1:8000/api/ws/interview/00000000-0000-0000-0000-000000000000?token=invalid" 2>&1

echo ""
echo "===== F. 后端容器最近日志(找WS/Error) ====="
docker logs --tail 200 interview-backend 2>&1 | grep -ivE 'GET /api/health|HEAD /api/health' | tail -30
