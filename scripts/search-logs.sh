#!/bin/bash

# LucidMerged - Log Search Script
# Quick search across all log files

# Check if search term provided
if [ -z "$1" ]; then
    echo "Usage: ./scripts/search-logs.sh <search-term> [options]"
    echo ""
    echo "Examples:"
    echo "  ./scripts/search-logs.sh error"
    echo "  ./scripts/search-logs.sh 'assistant.*abc123'"
    echo "  ./scripts/search-logs.sh error --context 5"
    echo "  ./scripts/search-logs.sh error --json"
    echo ""
    exit 1
fi

SEARCH_TERM="$1"
CONTEXT_LINES="${2:-0}"
JSON_MODE="${3}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Searching logs for: ${YELLOW}$SEARCH_TERM${NC}"
echo ""

# Check if logs directory exists
if [ ! -d "logs" ]; then
    echo -e "${RED}❌ No logs directory found${NC}"
    echo "Run ./scripts/capture-logs.sh first to generate logs"
    exit 1
fi

# Count total log files
LOG_COUNT=$(find logs -name "*.log" -o -name "*.json" | wc -l)
echo -e "${GREEN}Found $LOG_COUNT log file(s)${NC}"
echo ""

# Function to search with context
search_with_context() {
    if [ "$CONTEXT_LINES" -gt 0 ]; then
        grep -r -i -C "$CONTEXT_LINES" "$SEARCH_TERM" logs/
    else
        grep -r -i "$SEARCH_TERM" logs/
    fi
}

# Function to search JSON logs
search_json() {
    if command -v jq &> /dev/null; then
        find logs -name "*.json" -exec sh -c \
            'jq -r "select(.message | test(\"'"$SEARCH_TERM"'\"; \"i\"))" "$1" 2>/dev/null' \
            _ {} \;
    else
        echo -e "${YELLOW}⚠️  jq not installed, falling back to grep${NC}"
        grep -r -i "$SEARCH_TERM" logs/*.json 2>/dev/null
    fi
}

# Perform search
if [ "$JSON_MODE" == "--json" ]; then
    echo -e "${BLUE}Searching JSON logs with jq...${NC}"
    RESULTS=$(search_json)
else
    echo -e "${BLUE}Searching all logs...${NC}"
    RESULTS=$(search_with_context)
fi

# Display results
if [ -z "$RESULTS" ]; then
    echo -e "${YELLOW}No matches found${NC}"
else
    echo "$RESULTS"
    echo ""
    
    # Count matches
    MATCH_COUNT=$(echo "$RESULTS" | wc -l)
    echo -e "${GREEN}Found $MATCH_COUNT match(es)${NC}"
fi

echo ""
echo -e "${BLUE}💡 Tips:${NC}"
echo "  - Add --context 5 to see 5 lines before/after each match"
echo "  - Add --json to search JSON logs with jq"
echo "  - Use regex: ./scripts/search-logs.sh 'error|warning|fatal'"
echo "  - Case-sensitive: Remove -i flag from grep in this script"