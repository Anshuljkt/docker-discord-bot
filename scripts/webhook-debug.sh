#!/bin/bash
# Portainer Webhook Debug and Test Utility
# This script helps debug and validate Portainer webhook URLs

# Default values
VERBOSE=0
DEBUG=0
CF_ACCESS_CLIENT_ID=""
CF_ACCESS_CLIENT_SECRET=""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
function show_usage {
  echo -e "${BLUE}Portainer Webhook Debug Utility${NC}"
  echo "Usage: $0 [options] WEBHOOK_URL"
  echo ""
  echo "Options:"
  echo "  -v, --verbose    Show detailed output including headers"
  echo "  -d, --debug      Dry run mode (don't send actual request)"
  echo "  -h, --help       Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 https://portainer.example.com/api/webhooks/abcd1234"
  echo "  $0 --verbose https://portainer.example.com/api/webhooks/abcd1234"
  echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--verbose)
      VERBOSE=1
      shift
      ;;
    -d|--debug)
      DEBUG=1
      shift
      ;;
    -h|--help)
      show_usage
      exit 0
      ;;
    http*://*)
      WEBHOOK_URL="$1"
      shift
      ;;
    *)
      echo -e "${RED}Error: Unknown option or invalid URL: $1${NC}"
      show_usage
      exit 1
      ;;
  esac
done

# Check if webhook URL is provided
if [ -z "$WEBHOOK_URL" ]; then
  echo -e "${RED}Error: No webhook URL provided${NC}"
  show_usage
  exit 1
fi

# Validate URL format
if ! [[ "$WEBHOOK_URL" =~ ^https?://[^/]+/api/webhooks/[a-zA-Z0-9]+ ]]; then
  echo -e "${YELLOW}Warning: URL doesn't match expected Portainer webhook format${NC}"
  echo -e "Expected format: ${BLUE}https://portainer.example.com/api/webhooks/[webhook-id]${NC}"
  echo ""
fi

# Extract hostname
WEBHOOK_HOST=$(echo "$WEBHOOK_URL" | sed -E 's|https?://([^/]+)/.*|\1|')
echo -e "${BLUE}Webhook URL analysis:${NC}"
echo "  Full URL: $WEBHOOK_URL"
echo "  Host: $WEBHOOK_HOST"
echo ""

# Test basic connectivity to host
echo -e "${BLUE}Testing connectivity to Portainer host...${NC}"
if curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n  Response time: %{time_total}s\n" \
  "https://$WEBHOOK_HOST" 2>/dev/null; then
  echo -e "  ${GREEN}✓ Host is reachable${NC}"
else
  echo -e "  ${RED}✗ Cannot reach host${NC}"
  echo "  This could be due to:"
  echo "    - Incorrect hostname"
  echo "    - Host is not accessible from your network"
  echo "    - HTTPS certificate issues"
  echo ""
  echo -e "${YELLOW}Try using curl to test basic connectivity:${NC}"
  echo "  curl -v https://$WEBHOOK_HOST"
  echo ""
  exit 1
fi
echo ""

# Verify webhook ID format
WEBHOOK_ID=$(echo "$WEBHOOK_URL" | sed -E 's|.*/api/webhooks/([a-zA-Z0-9]+).*|\1|')
if [[ ${#WEBHOOK_ID} -lt 5 ]]; then
  echo -e "${YELLOW}Warning: Webhook ID '${WEBHOOK_ID}' seems too short${NC}"
else
  echo -e "${BLUE}Webhook ID:${NC} $WEBHOOK_ID (seems valid)"
fi
echo ""

# If in debug mode, exit now
if [ $DEBUG -eq 1 ]; then
  echo -e "${YELLOW}DEBUG MODE: Would send POST request to: ${WEBHOOK_URL}${NC}"
  echo "No actual request was sent."
  exit 0
fi

# Trigger webhook
echo -e "${BLUE}Triggering webhook...${NC}"
if [ $VERBOSE -eq 1 ]; then
  echo -e "${YELLOW}Sending verbose request:${NC}"
  curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -v
  echo ""
else
  RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json")
  if [ "$RESULT" -ge 200 ] && [ "$RESULT" -lt 300 ]; then
    echo -e "  ${GREEN}✓ Success! Response code: $RESULT${NC}"
    echo "  Portainer should be updating your stack now."
  else
    echo -e "  ${RED}✗ Failed. Response code: $RESULT${NC}"
    echo -e "${YELLOW}Try running with --verbose for more details${NC}"
  fi
fi
echo ""
echo -e "${BLUE}Done.${NC}"
