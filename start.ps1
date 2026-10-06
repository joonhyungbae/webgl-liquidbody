# 켜기 (윈도우 PowerShell)
#
#   .\start.ps1                 카메라로 켠다
#   .\start.ps1 --sim           카메라 없이 가짜 사람으로
#   .\start.ps1 --display       조절판 없이 화면만 (전시용)
#   .\start.ps1 --offline 20    장비 없이 20초를 out.mp4 로 적는다
#   .\start.ps1 --port 7001     포트를 바꾼다
#   .\start.ps1 --paint         그림 모델 덧칠까지 같이 켠다 (.\install.ps1 --paint 로 먼저 깐다)
#
# conda 환경(liquidbody)으로 켠다.
Set-Location $PSScriptRoot
$env:PYTHONNOUSERSITE = "1"   # 사용자 폴더에 따로 깐 파이썬 패키지가 섞이지 않게
. .\scripts\conda.ps1
$Conda = Find-Conda
if (-not $Conda) { Write-Host "conda 가 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
if (-not (Test-CondaEnv $Conda)) { Write-Host "conda 환경($EnvName)이 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "web\models\selfie_segmenter.tflite")) { & $Conda run --no-capture-output -n $EnvName python fetch_model.py }

# --paint 가 있으면 덧칠 서버를 같이 켜고, 끌 때 함께 끈다. 창을 두 개 띄울 일이 없다.
$Rest = @($args | Where-Object { $_ -ne "--paint" })
$PaintProc = $null
if ($args -contains "--paint") {
  Write-Host "▸ 그림 덧칠 서버를 켭니다" -ForegroundColor Cyan
  $PaintProc = Start-Process -PassThru -NoNewWindow -FilePath $Conda `
    -ArgumentList @("run", "--no-capture-output", "-n", $EnvName, "python", "paint.py", "--size", "448")
  # 조절판의 「덧칠」을 처음부터 켜 둔다. 켜 놓고도 안 보이면 켠 줄을 모른다
  $Rest += @("--query", "paint=0.5")
}
try {
  & $Conda run --no-capture-output -n $EnvName python serve.py @Rest
} finally {
  # conda run 아래의 python 까지 함께 끈다
  if ($PaintProc) { taskkill /T /F /PID $PaintProc.Id 2>$null | Out-Null }
}
