#!/bin/bash
# certbot manual-auth-hook: 把 TXT 验证值写文件, 阻塞等待放行标志
echo "$CERTBOT_VALIDATION" > /tmp/acme_val.txt
echo "$CERTBOT_DOMAIN" > /tmp/acme_domain.txt
# 等待 /tmp/acme_go 出现, 最多 900 秒(15分钟, 够加DNS+生效)
for i in $(seq 1 900); do
  if [ -f /tmp/acme_go ]; then
    rm -f /tmp/acme_go
    exit 0
  fi
  sleep 1
done
exit 1
