Param(
    [Parameter(Mandatory = $false)]
    [string]$Action = "run"
)

$projectName = "DATN backend"
$version = "1.0"

Write-Host "Running project: $projectName with version $version" -ForegroundColor Magenta

$rootDir = (Get-Location).Path
$python = Join-Path $rootDir ".venv\Scripts\activate.ps1"
$pip = Join-Path $rootDir ".venv\Scripts\pip.exe"

# Node.js services (npm install + prisma generate)
$nodeServices = @("iam-service", "media-service", "api-gateway", "course-service")

# Python AI services (pip install)
$aiServices = @("orchestrator-ai", "rag-ai", "recommendation-ai")

switch ($Action) {
    "init" {
        Write-Host "--- INITIALIZING NODE SERVICES ---" -ForegroundColor Cyan
        foreach ($service in $nodeServices) {
        Write-Host "--- INITIALIZING NODE SERVICES ---" -ForegroundColor Cyan
        foreach ($service in $nodeServices) {
            Write-Host "Processing $service..." -ForegroundColor Yellow
            $servicePath = Join-Path $rootDir $service
            Push-Location $servicePath
            try {
                npm install
                npx prisma generate
            }
            finally {
                Pop-Location
            }
        }

        # Write-Host "--- INITIALIZING AI SERVICES ---" -ForegroundColor Cyan
        # foreach ($service in $aiServices) {
        #     Write-Host "Processing $service..." -ForegroundColor Yellow
        #     $servicePath = Join-Path $rootDir $service
        #     Push-Location $servicePath
        #     try {
        #         & $pip install -r requirements.txt
        #     }
        #     finally {
        #         Pop-Location
        #     }
        # }

        Write-Host "All services initialized!" -ForegroundColor Green
    }


    "run" {
        Write-Host "--- STARTING MICROSERVICES ---" -ForegroundColor Green

        foreach ($service in $nodeServices) {

        foreach ($service in $nodeServices) {
            Write-Host "Launching $service in a new window..." -ForegroundColor Gray
            $servicePath = Join-Path $rootDir $service
            Start-Process powershell -ArgumentList @(
                "-NoExit",
                "-Command",
                "Set-Location -LiteralPath '$servicePath'; npm run start:dev"
            )
        }

        foreach ($service in $aiServices) {
            Write-Host "Launching $service in a new window..." -ForegroundColor Gray
            $servicePath = Join-Path $rootDir $service
            Start-Process powershell -ArgumentList @(
                "-NoExit",
                "-Command",
                "Set-Location -LiteralPath '$servicePath'; & '$python' main.py"
            )
        }
    }


    Default {
        Write-Host "Unknown action: $Action. Use 'init' or 'run'." -ForegroundColor Red
        exit 1
    }
}