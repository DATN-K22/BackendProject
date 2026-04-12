#!/bin/bash

# Default action
ACTION="${1:-run}"

PROJECT_NAME="DATN backend"
VERSION="1.0"

echo -e "\033[0;35mRunning project: $PROJECT_NAME with version $VERSION\033[0m"

ROOT_DIR="$(pwd)"
PYTHON="$ROOT_DIR/.conda/bin/python"

# Node.js services (npm install + prisma generate)
NODE_SERVICES=("iam-service" "media-service" "api-gateway" "course-service")

# Python AI services (pip install)
AI_SERVICES=("orchestrator-ai" "rag-ai" "recommendation-ai")

case "$ACTION" in
    init)
        echo -e "\033[0;36m--- INITIALIZING NODE SERVICES ---\033[0m"
        for service in "${NODE_SERVICES[@]}"; do
            echo -e "\033[0;33mProcessing $service...\033[0m"
            cd "$ROOT_DIR/$service" || exit

            npm install
            npx prisma generate
        done

        echo -e "\033[0;36m--- INITIALIZING AI SERVICES ---\033[0m"
        for service in "${AI_SERVICES[@]}"; do
            echo -e "\033[0;33mProcessing $service...\033[0m"
            cd "$ROOT_DIR/$service" || exit

            "$ROOT_DIR/.conda/bin/pip" install -r requirements.txt
        done

        echo -e "\033[0;32mAll services initialized!\033[0m"
        ;;

    run)
        echo -e "\033[0;32m--- STARTING MICROSERVICES ---\033[0m"

        # Start each Node service in a new Terminal tab
        for service in "${NODE_SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            osascript -e "tell application \"Terminal\" to do script \"cd $ROOT_DIR/$service && doppler run -- npm run start:dev\""
        done

        # Start each AI service in a new Terminal tab
        for service in "${AI_SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            osascript -e "tell application \"Terminal\" to do script \"cd $ROOT_DIR/$service && doppler run -- $PYTHON main.py\""
        done
        ;;

    *)
        echo -e "\033[0;31mUnknown action: $ACTION. Use 'init' or 'run'.\033[0m"
        exit 1
        ;;
esac
