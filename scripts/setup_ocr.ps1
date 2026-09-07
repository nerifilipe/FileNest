$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tesseractPath = Join-Path $env:ProgramFiles 'Tesseract-OCR\tesseract.exe'
if (-not (Test-Path -LiteralPath $tesseractPath)) {
    winget install --id UB-Mannheim.TesseractOCR --exact --source winget --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar o Tesseract.' }
}
if (-not (Test-Path -LiteralPath $tesseractPath)) { throw 'Tesseract não encontrado na localização padrão.' }
$dataDirectory = Join-Path $projectRoot '.filenest\tessdata'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
foreach ($language in @('por', 'eng')) {
    $destination = Join-Path $dataDirectory "$language.traineddata"
    if (-not (Test-Path -LiteralPath $destination)) {
        $partialDownload = "$destination.download"
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$language.traineddata" -OutFile $partialDownload
        Move-Item -LiteralPath $partialDownload -Destination $destination
    }
}
& $tesseractPath --tessdata-dir $dataDirectory --list-langs
if ($LASTEXITCODE -ne 0) { throw 'Falhou a verificação dos idiomas de OCR.' }
Write-Output 'OCR local configurado. Reinicie o backend e ative OCR no FileNest.'
