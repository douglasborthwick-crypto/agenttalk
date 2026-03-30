#!/usr/bin/env bash
# AgentTalk — full session flow (declare → join → verify)
# Uses the free tier (no API key needed for first 10 calls per wallet)

set -euo pipefail

BASE_URL="https://skyemeta.com/api/agenttalk"

# Replace with real wallet addresses
AGENT_A_WALLET="0x1234567890abcdef1234567890abcdef12345678"
AGENT_B_WALLET="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"

echo "=== Step 1: Agent A declares conditions ==="
DECLARE_RESPONSE=$(curl -s -X POST "$BASE_URL/declare" \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"$AGENT_A_WALLET\",
    \"conditions\": [
      {
        \"type\": \"token_balance\",
        \"contractAddress\": \"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48\",
        \"chainId\": 1,
        \"threshold\": 1000,
        \"decimals\": 6
      }
    ]
  }")

echo "$DECLARE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$DECLARE_RESPONSE"

CHANNEL_ID=$(echo "$DECLARE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['channelId'])" 2>/dev/null)

if [ -z "$CHANNEL_ID" ]; then
  echo "Declare failed — check wallet address and conditions"
  exit 1
fi

echo ""
echo "=== Step 2: Agent B joins the channel ==="
JOIN_RESPONSE=$(curl -s -X POST "$BASE_URL/join" \
  -H "Content-Type: application/json" \
  -d "{
    \"channelId\": \"$CHANNEL_ID\",
    \"wallet\": \"$AGENT_B_WALLET\"
  }")

echo "$JOIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$JOIN_RESPONSE"

SESSION_ID=$(echo "$JOIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])" 2>/dev/null)

if [ -z "$SESSION_ID" ]; then
  echo "Join failed — joiner wallet may not meet conditions"
  exit 1
fi

echo ""
echo "=== Step 3: Verify session ==="
curl -s "$BASE_URL/session?id=$SESSION_ID" | python3 -m json.tool 2>/dev/null
