#!/usr/bin/env bash
#
# 한 줄로 깔기 (맥 · 리눅스)
#
#   curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.sh | bash
#
# 그림 모델 덧칠까지 쓰려면 --paint 를 붙인다. 이미 깐 폴더에서 다시 실행해도 된다.
#   curl -fsSL https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.sh | bash -s -- --paint
#   ./install.sh --paint
#
# 하는 일: 저장소 받기 → conda 확인(없으면 Miniforge 를 깐다) → conda 환경 만들기
#          → 몸을 찾는 모델 받기 → (--paint 면) 덧칠에 쓰는 torch 와 그림 모델 받기
#          → 켜는 법 알려 주기.
# 이미 받아 둔 폴더 안에서 실행해도 된다.
set -euo pipefail

# 사용자 폴더(~/.local)에 따로 깐 파이썬 패키지가 conda 환경에 섞이지 않게 한다
export PYTHONNOUSERSITE=1

PAINT=""
for a in "$@"; do
  case "$a" in --paint) PAINT="1" ;; esac
done

REPO="https://github.com/joonhyungbae/webgl-liquidbody"
NAME="webgl-liquidbody"

say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
oops() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. 저장소 ────────────────────────────────────────────────────────────
if [ -f "serve.py" ] && [ -d "web" ]; then
  DIR="$(pwd)"
  say "이미 받아 둔 폴더에서 실행합니다: $DIR"
else
  DIR="$(pwd)/$NAME"
  if [ -d "$DIR/.git" ] && command -v git >/dev/null 2>&1; then
    say "폴더가 이미 있어 최신으로 받습니다: $DIR"
    git -C "$DIR" pull --ff-only >/dev/null 2>&1 || say "최신으로 받지 못했습니다. 있는 그대로 씁니다."
  elif [ -d "$DIR" ]; then
    say "폴더가 이미 있어 그대로 씁니다: $DIR"
  elif command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then
    say "받는 중: $DIR"
    git clone -q "$REPO" "$DIR"
  else
    # git 이 없으면 압축 파일로 받는다. 맥에서 개발 도구 설치 창이 뜨는 것을 피한다.
    say "받는 중 (압축 파일): $DIR"
    mkdir -p "$DIR"
    curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz -C "$DIR" --strip-components 1
  fi
fi
cd "$DIR"
# shellcheck source=scripts/conda.sh
source scripts/conda.sh

# ── 2. conda ─────────────────────────────────────────────────────────────
# 언제나 conda 환경으로 돌린다. conda 가 없으면 Miniforge 를 사용자 폴더에 깐다.
if CONDA="$(find_conda)"; then
  say "conda 를 씁니다: $CONDA"
else
  say "conda 가 없어 Miniforge 를 깝니다 (~/miniforge3, 몇 분 걸립니다)"
  CONDA="$(install_miniforge)" || oops "Miniforge 를 깔지 못했습니다. https://conda-forge.org/download/ 에서 받아 깐 뒤 이 명령을 다시 실행하세요."
fi

# ── 3. 환경 ──────────────────────────────────────────────────────────────
if env_exists "$CONDA"; then
  say "이미 있는 환경을 최신으로 맞춥니다: $ENV_NAME"
  "$CONDA" env update -q -n "$ENV_NAME" -f environment.yml --prune >/dev/null
else
  say "conda 환경을 만듭니다: $ENV_NAME"
  "$CONDA" env create -q -f environment.yml >/dev/null
fi

# ── 4. 몸을 찾는 모델 ─────────────────────────────────────────────────────
say "몸을 찾는 모델을 받습니다 (약 250KB)"
"$CONDA" run --no-capture-output -n "$ENV_NAME" python fetch_model.py \
  || say "받지 못했습니다. 인터넷을 확인하세요. 가짜 사람(--sim)으로 쓰는 데는 지장이 없고, 나중에 ./start.sh 가 다시 받아 봅니다."

# ── 5. (--paint) 덧칠에 쓰는 torch 와 그림 모델 ──────────────────────────
# conda 환경 안에 깐다. 그냥 pip install 을 하면 환경 밖에 깔려 덧칠 서버가 찾지 못한다.
if [ -n "$PAINT" ]; then
  if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" != "arm64" ]; then
    say "인텔 맥에서는 그림 모델이 너무 느려 덧칠을 쓰기 어렵습니다. 깔기는 하지만 덧칠 없이 쓰기를 권합니다."
  fi
  # NVIDIA 면 드라이버가 받쳐 주는 CUDA 판을 고른다. 그냥 받으면 가장 새 판이 와서, 드라이버가
  # 조금만 오래돼도 그래픽 칩을 못 잡고 조용히 cpu 로 돈다(한 장에 몇 초)
  INDEX=()
  if [ "$(uname -s)" = "Linux" ] && command -v nvidia-smi >/dev/null 2>&1; then
    CU="$(nvidia-smi 2>/dev/null | grep -o 'CUDA Version: [0-9]*\.[0-9]*' | grep -o '[0-9]*\.[0-9]*' || true)"
    case "$CU" in
      1[3-9].*|12.9|12.8) INDEX=(--index-url https://download.pytorch.org/whl/cu128) ;;
      12.7|12.6) INDEX=(--index-url https://download.pytorch.org/whl/cu126) ;;
      12.*) INDEX=(--index-url https://download.pytorch.org/whl/cu124) ;;
      11.*) INDEX=(--index-url https://download.pytorch.org/whl/cu118) ;;
    esac
    say "NVIDIA 드라이버(CUDA $CU)에 맞는 torch 를 고릅니다"
  fi
  say "덧칠에 쓰는 torch 와 diffusers 를 깝니다 (맥은 수백 MB, NVIDIA 리눅스는 몇 GB. 몇 분 걸립니다)"
  "$CONDA" run --no-capture-output -n "$ENV_NAME" python -m pip install -q torch ${INDEX[@]+"${INDEX[@]}"} \
    || oops "torch 를 깔지 못했습니다. 인터넷을 확인하고 ./install.sh --paint 를 다시 실행하세요."
  "$CONDA" run --no-capture-output -n "$ENV_NAME" python -m pip install -q diffusers transformers accelerate pillow \
    || oops "diffusers 를 깔지 못했습니다. ./install.sh --paint 를 다시 실행하세요."
  # 깐 torch 가 그래픽 칩을 잡는지 바로 확인한다. 못 잡으면 켤 때가 아니라 지금 알린다
  device() {
    "$CONDA" run -n "$ENV_NAME" python -c 'import torch; print("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")' 2>/dev/null \
      | grep -E '^(cuda|mps|cpu)$' | tail -1
  }
  DEV="$(device)"
  # 이미 깔린 torch 가 드라이버보다 새 판이면 pip 이 건너뛴다. 드라이버에 맞는 판으로 다시 깐다
  if [ "$DEV" = "cpu" ] && [ ${#INDEX[@]} -gt 0 ]; then
    say "깔려 있던 torch 가 그래픽 칩을 잡지 못해 드라이버에 맞는 판으로 다시 깝니다"
    "$CONDA" run --no-capture-output -n "$ENV_NAME" python -m pip install -q --force-reinstall torch "${INDEX[@]}" \
      || oops "torch 를 다시 깔지 못했습니다. ./install.sh --paint 를 다시 실행하세요."
    DEV="$(device)"
  fi
  case "$DEV" in
    cuda|mps) say "torch 가 그래픽 칩을 잡았습니다: $DEV" ;;
    *) say "torch 가 그래픽 칩을 잡지 못했습니다(${DEV:-확인 못 함}). 덧칠이 한 장에 몇 초씩 걸립니다. NVIDIA 면 드라이버를 새로 깔고 다시 실행하세요." ;;
  esac
  say "그림 모델을 받아 둡니다 (sd-turbo 약 2.5GB). 전시장에서 처음 켤 때 기다리지 않게 지금 받습니다"
  "$CONDA" run --no-capture-output -n "$ENV_NAME" python paint.py --fetch \
    || say "그림 모델을 받지 못했습니다. ./start.sh --paint 를 처음 켤 때 다시 받습니다."
  # start.command 를 더블클릭해도 덧칠까지 켜지게 표시해 둔다
  touch .paint
fi

chmod +x start.sh start.command 2>/dev/null || true

echo
say "다 됐습니다. 이렇게 켭니다."
echo
echo "    cd \"$DIR\""
if [ -n "$PAINT" ]; then echo "    ./start.sh --paint"; else echo "    ./start.sh"; fi
echo
echo "  브라우저가 127.0.0.1:7000 으로 열립니다. 끌 때는 Ctrl+C 입니다."
echo "  카메라가 없으면 ./start.sh --sim 으로 가짜 사람을 띄워 그림부터 만집니다."
echo "  맥에서는 폴더의 start.command 를 더블클릭해도 됩니다.$([ -n "$PAINT" ] && echo " 덧칠까지 같이 켜집니다.")"
echo "  ./start.sh 없이 직접 켜려면:  \"$CONDA\" run -n $ENV_NAME python serve.py"
[ -n "$PAINT" ] || echo "  그림 모델 덧칠까지 쓰려면 이 폴더에서 ./install.sh --paint 를 한 번 더 실행합니다."
