#!/bin/bash

# Default action
ACTION="${1:-run}"

PROJECT_NAME="DATN backend"
VERSION="1.0"

echo -e "\033[0;35mRunning project: $PROJECT_NAME with version $VERSION\033[0m"

# List of services
SERVICES=("iam-service" "media-service" "course-service")

case "$ACTION" in
    init)
        echo -e "\033[0;36m--- INITIALIZING ALL SERVICES ---\033[0m"
        for service in "${SERVICES[@]}"; do
            echo -e "\033[0;33mProcessing $service...\033[0m"
            cd "$service" || exit
            
            npm install
            npx prisma generate
            
            cd ..
        done
        echo -e "\033[0;32mAll services initialized!\033[0m"

        docker compose -f Docker-compose.yml up
        ;;
    
    run)
        echo -e "\033[0;32m--- STARTING MICROSERVICES ---\033[0m"
        
        # Start each service in a new terminal tab
        for service in "${SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            
            # Using osascript to open new Terminal tabs on macOS
            osascript -e "tell application \"Terminal\" to do script \"cd $(pwd)/$service && npm run start:dev\""
        done
        
        # Wait a moment for services to start, then run docker compose
        sleep 2
        docker compose -f Docker-compose.yml up
        ;;
    
    *)
        echo -e "\033[0;31mUnknown action: $ACTION. Use 'init' or 'run'.\033[0m"
        exit 1
        ;;
esac
