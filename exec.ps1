# Cần đặt Param ở dòng ĐẦU TIÊN của file (trước cả khai báo biến)
Param(
    [Parameter(Mandatory=$false)]
    [String]$Action = "run"
)

$projectName = "DATN backend"
$version = 1.0

Write-Host "Running project: $projectName with version $version" -ForegroundColor Magenta

$rootDir = (Get-Location).Path

# Prefer .venv on Windows (team setup), then fallback to conda.
$isWindows = $env:OS -eq "Windows_NT"

if ($isWindows) {
    $pythonCandidates = @(
        (Join-Path $rootDir ".venv\Scripts\python.exe"),
        (Join-Path $rootDir ".conda\python.exe"),
        (Join-Path $rootDir ".conda\Scripts\python.exe")
    )
    $pipCandidates = @(
        (Join-Path $rootDir ".venv\Scripts\pip.exe"),
        (Join-Path $rootDir ".conda\Scripts\pip.exe")
    )
}
else {
    $pythonCandidates = @(
        (Join-Path $rootDir ".venv/bin/python"),
        (Join-Path $rootDir ".conda/bin/python")
    )
    $pipCandidates = @(
        (Join-Path $rootDir ".venv/bin/pip"),
        (Join-Path $rootDir ".conda/bin/pip")
    )
}

$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$pip = $pipCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($isWindows -and $python -like "*\.venv\Scripts\python.exe") {
    $venvCfg = Join-Path $rootDir ".venv\pyvenv.cfg"
    if (-not (Test-Path $venvCfg)) {
        Write-Host "Detected .venv python but missing $venvCfg" -ForegroundColor Red
        Write-Host "Your virtual environment is likely corrupted or incomplete." -ForegroundColor Yellow
        Write-Host "Recreate it with:" -ForegroundColor Cyan
        Write-Host "  py -3.12 -m venv .venv" -ForegroundColor Gray
        Write-Host "  .\.venv\Scripts\pip install -r rag-ai\requirements.txt" -ForegroundColor Gray
        exit 1
    }
}

if (-not $python -or -not $pip) {
    Write-Host "Python environment not found. Expected one of these:" -ForegroundColor Red
    $pythonCandidates | ForEach-Object { Write-Host " - $_" -ForegroundColor DarkRed }
    $pipCandidates | ForEach-Object { Write-Host " - $_" -ForegroundColor DarkRed }
    Write-Host "Please create .venv (recommended on Windows) or .conda first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Using Python: $python" -ForegroundColor DarkCyan

# Node.js services (npm install + prisma generate)
$nodeServices = "iam-service", "media-service", "api-gateway", "course-service"

# Python AI services (pip install)
$aiServices = "orchestrator-ai", "rag-ai", "recommendation-ai"

switch ($Action) {
    "init" {
        Write-Host "--- INITIALIZING NODE SERVICES ---" -ForegroundColor Cyan
        foreach ($service in $nodeServices) {
            Write-Host "Processing $service..." -ForegroundColor Yellow
            Push-Location $service

            npm install
            npx prisma generate

            Pop-Location
        }

        Write-Host "--- INITIALIZING AI SERVICES ---" -ForegroundColor Cyan
        foreach ($service in $aiServices) {
            Write-Host "Processing $service..." -ForegroundColor Yellow
            Push-Location $service

            & $pip install -r requirements.txt

            Pop-Location
        }

        Write-Host "All services initialized!" -ForegroundColor Green
    }

    "run" {
        Write-Host "--- STARTING MICROSERVICES ---" -ForegroundColor Green

        foreach ($service in $nodeServices) {
            Write-Host "Launching $service in a new window..." -ForegroundColor Gray
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $service; npm run start:dev"
        }

        foreach ($service in $aiServices) {
            Write-Host "Launching $service in a new window..." -ForegroundColor Gray
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $service; & '$python' main.py"
        }
    }

    Default {
        Write-Host "Unknown action: $Action. Use 'init' or 'run'." -ForegroundColor Red
    }
}