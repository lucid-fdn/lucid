#!/bin/bash

# LucidMerged - Log Capture Script
# Captures both Worker and Next.js logs to timestamped files

# Create logs directory
mkdir -p logs

# Timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📝 LucidMerged Log Capture${NC}"
echo -e "${GREEN}Capturing logs to:${NC}"
echo -e "   📄 logs/$TIMESTAMP-worker.log"
echo -e "   📄 logs/$TIMESTAMP-nextjs.log"
echo ""

# Start worker in background with log capture
echo -e "${GREEN}Starting worker log capture...${NC}"
(cd worker && npm run dev) 2>&1 | tee logs/$TIMESTAMP-worker.log &
WORKER_PID=$!

# Give worker a moment to start
sleep 2

# Start Next.js in background with log capture
echo -e "${GREEN}Starting Next.js log capture...${NC}"
npm run dev 2>&1 | tee logs/$TIMESTAMP-nextjs.log &
NEXTJS_PID=$!

echo ""
echo -e "${GREEN}✅ Logging started!${NC}"
echo ""
echo "Commands:"
echo "  - Press Ctrl+C to stop and save logs"
echo "  - In another terminal, run: ./scripts/search-logs.sh error"
echo "  - View logs: tail -f logs/$TIMESTAMP-worker.log"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${BLUE}Stopping services and saving logs...${NC}"
    kill $WORKER_PID 2>/dev/null
    kill $NEXTJS_PID 2>/dev/null
    echo -e "${GREEN}✅ Logs saved!${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

# Wait for processes
wait