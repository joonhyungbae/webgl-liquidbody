#!/usr/bin/env bash
#
# 켜기 (맥 · 리눅스)
#
#   ./start.sh                 카메라로 켠다
#   ./start.sh --sim           카메라 없이 가짜 사람으로
#   ./start.sh --display       조절판 없이 화면만 (전시용)
#   ./start.sh --light         가벼운 노트북용. 감지 그림과 화면 해상도를 낮춘다
#   ./start.sh --paint         그림 모델 덧칠까지 같이 켠다 (시험용 백엔드)
#   ./start.sh --paint diffusion   진짜 그림 모델로 덧칠한다
#   ./start.sh --offline 20    장비 없이 20초를 out.mp4 로 적는다
#   ./start.sh --host 0.0.0.0  다른 컴퓨터에서 본다
#   ./start.sh --port 7001     포트를 바꾼다
#
# conda 환경(liquidbody)으로 켠다. conda 는 터미널 설정 없이도 찾는다(scripts/conda.sh).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/conda.sh
source scripts/conda.sh

CONDA="$(find_conda)" || { echo "conda 가 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
env_exists "$CONDA" || { echo "conda 환경($ENV_NAME)이 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
py() { "$CONDA" run --no-capture-output -n "$ENV_NAME" python "$@"; }

# 모델이 없으면 한 번 받아 본다. 못 받아도 가짜 사람으로는 돈다.
[ -f "web/models/selfie_segmenter.tflite" ] || py fetch_model.py || true

# --paint 가 있으면 덧칠 서버를 같이 켜고, 끌 때 함께 끈다. 창을 두 개 띄울 일이 없다.
ARGS=()
PAINT=""
LIGHT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --light) LIGHT="1" ;;
    --paint)
      PAINT="stub"
      case "${2:-}" in stub|diffusion) PAINT="$2"; shift ;; esac
      ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

QUERY=""
if [ -n "$LIGHT" ]; then
  echo "▸ 가벼운 쪽으로 켭니다 (감지 256, 화면 해상도 낮춤)"
  QUERY="in=256&light"
fi

if [ -n "$PAINT" ]; then
  echo "▸ 그림 덧칠 서버를 켭니다 ($PAINT)"
  # 가벼운 기계에서는 모델에 넣는 그림도 줄인다
  py paint.py --backend "$PAINT" --size $([ -n "$LIGHT" ] && echo 320 || echo 448) &
  PAINT_PID=$!
  trap 'kill $PAINT_PID 2>/dev/null || true' EXIT
  sleep 1
  # 조절판의 「덧칠」을 처음부터 켜 둔다. 켜 놓고도 안 보이면 켠 줄을 모른다
  QUERY="${QUERY:+$QUERY&}paint=0.5"
fi

[ -n "$QUERY" ] && ARGS+=(--query "$QUERY")

py serve.py "${ARGS[@]}"
