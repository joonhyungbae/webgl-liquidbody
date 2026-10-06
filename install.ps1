# 한 줄로 깔기 (윈도우 PowerShell)
#
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm https://raw.githubusercontent.com/joonhyungbae/webgl-liquidbody/main/install.ps1 -OutFile "$env:TEMP\install.ps1"
#   & "$env:TEMP\install.ps1"
#
# 그림 모델 덧칠까지 쓰려면 --paint 를 붙인다. 이미 깐 폴더에서 다시 실행해도 된다.
#   & "$env:TEMP\install.ps1" --paint
#   .\install.ps1 --paint
#
# 하는 일: 저장소 받기 → conda 확인(없으면 Miniforge 를 깐다) → conda 환경 만들기
#          → 몸을 찾는 모델 받기 → (--paint 면) 덧칠에 쓰는 torch 와 그림 모델 받기
#          → 켜는 법 알려 주기.
$ErrorActionPreference = "Stop"
$Paint = $args -contains "--paint"
# 사용자 폴더에 따로 깐 파이썬 패키지가 conda 환경에 섞이지 않게 한다
$env:PYTHONNOUSERSITE = "1"
$Name = "webgl-liquidbody"
$Repo = "https://github.com/joonhyungbae/$Name"

function Say($t) { Write-Host "▸ $t" -ForegroundColor Cyan }

# ── 1. 저장소 ──
if ((Test-Path "serve.py") -and (Test-Path "web")) {
  $Dir = (Get-Location).Path
  Say "이미 받아 둔 폴더에서 실행합니다: $Dir"
} else {
  $Dir = Join-Path (Get-Location).Path $Name
  if (Test-Path $Dir) {
    Say "폴더가 이미 있어 그대로 씁니다: $Dir"
  } elseif (Get-Command git -ErrorAction SilentlyContinue) {
    Say "받는 중: $Dir"
    git clone -q $Repo $Dir
  } else {
    Say "받는 중 (압축 파일): $Dir"
    $Zip = Join-Path $env:TEMP "$Name.zip"
    Invoke-WebRequest "$Repo/archive/refs/heads/main.zip" -OutFile $Zip
    Expand-Archive $Zip -DestinationPath $env:TEMP -Force
    Move-Item (Join-Path $env:TEMP "$Name-main") $Dir
  }
}
Set-Location $Dir
. .\scripts\conda.ps1

# ── 2. conda. 언제나 conda 환경으로 돌린다 ──
$Conda = Find-Conda
if ($Conda) {
  Say "conda 를 씁니다: $Conda"
} else {
  Say "conda 가 없어 Miniforge 를 깝니다 (~\miniforge3, 몇 분 걸립니다)"
  $Conda = Install-Miniforge
}

# ── 3. 환경 ──
if (Test-CondaEnv $Conda) {
  Say "이미 있는 환경을 최신으로 맞춥니다: $EnvName"
  & $Conda env update -q -n $EnvName -f environment.yml --prune | Out-Null
} else {
  Say "conda 환경을 만듭니다: $EnvName"
  & $Conda env create -q -f environment.yml | Out-Null
}

# ── 4. 몸을 찾는 모델 ──
Say "몸을 찾는 모델을 받습니다 (약 250KB)"
& $Conda run --no-capture-output -n $EnvName python fetch_model.py
if ($LASTEXITCODE -ne 0) { Say "받지 못했습니다. 가짜 사람(--sim)으로 쓰는 데는 지장이 없습니다." }

# ── 5. (--paint) 덧칠에 쓰는 torch 와 그림 모델 ──
# conda 환경 안에 깐다. 그냥 pip install 을 하면 환경 밖에 깔려 덧칠 서버가 찾지 못한다.
# 윈도우의 pip torch 는 기본이 그래픽 칩을 쓰지 않는 판이라, NVIDIA 가 있으면 CUDA 판을 받는다.
if ($Paint) {
  $Index = @()
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    # 드라이버가 받쳐 주는 CUDA 판을 고른다. 너무 새 판을 받으면 그래픽 칩을 못 잡는다
    $Cu = 0.0
    $m = [regex]::Match((nvidia-smi | Out-String), "CUDA Version: (\d+\.\d+)")
    if ($m.Success) { $Cu = [double]$m.Groups[1].Value }
    $Tag = if ($Cu -ge 12.8) { "cu128" } elseif ($Cu -ge 12.6) { "cu126" } elseif ($Cu -ge 12.4) { "cu124" } else { "cu118" }
    $Index = @("--index-url", "https://download.pytorch.org/whl/$Tag")
    Say "NVIDIA 드라이버(CUDA $Cu)에 맞는 torch($Tag)를 깝니다 (몇 GB. 몇 분 걸립니다)"
  } else {
    Say "NVIDIA 그래픽 칩이 없습니다. 덧칠이 너무 느려 쓰기 어렵습니다. 깔기는 하지만 덧칠 없이 쓰기를 권합니다."
  }
  & $Conda run --no-capture-output -n $EnvName python -m pip install -q torch @Index
  if ($LASTEXITCODE -ne 0) { Write-Host "torch 를 깔지 못했습니다. 인터넷을 확인하고 .\install.ps1 --paint 를 다시 실행하세요." -ForegroundColor Red; exit 1 }
  & $Conda run --no-capture-output -n $EnvName python -m pip install -q diffusers transformers accelerate pillow
  if ($LASTEXITCODE -ne 0) { Write-Host "diffusers 를 깔지 못했습니다. .\install.ps1 --paint 를 다시 실행하세요." -ForegroundColor Red; exit 1 }
  Say "그림 모델을 받아 둡니다 (sd-turbo 약 2.5GB). 전시장에서 처음 켤 때 기다리지 않게 지금 받습니다"
  & $Conda run --no-capture-output -n $EnvName python paint.py --fetch
  if ($LASTEXITCODE -ne 0) { Say "그림 모델을 받지 못했습니다. .\start.ps1 --paint 를 처음 켤 때 다시 받습니다." }
}

Write-Host ""
Say "다 됐습니다. 이렇게 켭니다."
Write-Host ""
Write-Host "    cd `"$Dir`""
if ($Paint) { Write-Host "    .\start.ps1 --paint" } else { Write-Host "    .\start.ps1" }
Write-Host ""
Write-Host "  브라우저가 127.0.0.1:7000 으로 열립니다. 끌 때는 Ctrl+C 입니다."

Write-Host "  카메라가 없으면 .\start.ps1 --sim 으로 가짜 사람을 띄워 그림부터 만집니다."
if (-not $Paint) { Write-Host "  그림 모델 덧칠까지 쓰려면 이 폴더에서 .\install.ps1 --paint 를 한 번 더 실행합니다." }
