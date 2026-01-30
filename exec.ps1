# Cần đặt Param ở dòng ĐẦU TIÊN của file (trước cả khai báo biến)
Param(
    [Parameter(Mandatory=$false)]
    [String]$Action = "run"
)

$projectName = "DATN backend"
$version = 1.0

Write-Host "Running project: $projectName with version $version" -ForegroundColor Magenta

# Danh sách các service để dễ quản lý, tránh lặp lại code (DRY)
$services = "iam-service", "media-service"

switch ($Action) {
    "init" {
        Write-Host "--- INITIALIZING ALL SERVICES ---" -ForegroundColor Cyan
        foreach ($service in $services) {
            Write-Host "Processing $service..." -ForegroundColor Yellow
            Push-Location $service  # Giống 'cd' nhưng an toàn hơn
            
            npm install
            npx prisma generate
            
            Pop-Location # Quay về thư mục gốc
        }
        Write-Host "All services initialized!" -ForegroundColor Green

        docker compose -f Docker-compose.yml up
    }
    
    "run" {
        Write-Host "--- STARTING MICROSERVICES ---" -ForegroundColor Green
        foreach ($service in $services) {
            Write-Host "Launching $service in a new window..." -ForegroundColor Gray
            
            # Sử dụng Start-Process để chạy mỗi service ở 1 cửa sổ riêng
            # Điều này giúp các service chạy song song mà không chặn nhau
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $service; npm run start:dev"
        }
        
        docker compose -f Docker-compose.yml up
    }
    
    Default {
        Write-Host "Unknown action: $Action. Use 'init' or 'run'." -ForegroundColor Red
    }
}