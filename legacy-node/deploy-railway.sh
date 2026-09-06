#!/bin/bash
# Railway 배포. 이 디렉터리에서 실행하세요.
#   bash deploy-railway.sh
#
# 먼저 railway.com 에서 플랜을 고르고 `railway whoami` 가 되는지 확인하세요.
set -euo pipefail
cd "$(dirname "$0")"

SERVICE=isty-stock

# 접속 코드. 바꾸려면 여기를 고치고 다시 실행하세요.
BRAND_CODE="${ISTY_BRAND_CODE:?ISTY_BRAND_CODE 를 환경변수로 넘겨주세요}"
WAREHOUSE_CODE="${ISTY_WAREHOUSE_CODE:?ISTY_WAREHOUSE_CODE 를 환경변수로 넘겨주세요}"

echo "▶ 1/5  프로젝트 생성"
railway init --name "$SERVICE" --json

echo "▶ 2/5  서비스 생성 + 환경변수"
railway add --service "$SERVICE" \
  --variables "ISTY_DB=/data/isty.db" \
  --variables "ISTY_BRAND_CODE=$BRAND_CODE" \
  --variables "ISTY_WAREHOUSE_CODE=$WAREHOUSE_CODE"

echo "▶ 3/5  볼륨 붙이기 (/data) — 이게 없으면 재배포할 때마다 재고가 날아갑니다"
railway volume add --mount-path /data --service "$SERVICE"

echo "▶ 4/5  배포"
railway up --service "$SERVICE" --detach

echo "▶ 5/5  공개 주소 발급"
railway domain --service "$SERVICE"

echo
echo "완료. 접속 코드"
echo "  브랜드(미니)   : $BRAND_CODE"
echo "  창고(실장님)   : $WAREHOUSE_CODE"
echo
echo "지역을 유럽으로 옮기려면 Railway 대시보드에서"
echo "  Service → Settings → Regions → europe-west4 (Amsterdam)"
