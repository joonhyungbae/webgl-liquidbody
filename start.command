#!/bin/bash
# 맥에서 더블클릭하면 켜진다. 끝낼 때는 이 터미널 창을 닫는다.
# ./install.sh --paint 로 깔았으면(.paint 파일이 있으면) 그림 모델 덧칠까지 같이 켠다.
cd "$(dirname "$0")"
if [ -f .paint ]; then exec ./start.sh --paint; fi
exec ./start.sh
