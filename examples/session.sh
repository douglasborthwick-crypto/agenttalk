#!/usr/bin/env bash
# AgentTalk — full session flow (prove control → declare → join → verify)
# Uses the free tier (no API key needed for first 10 calls per wallet)
#
# Proof-of-control: on-chain holdings are public, so before any action an agent
# signs a one-time challenge with its wallet key. Control of the wallet — not
# knowledge of its address — is what grants entry.
#
# Wallets: by default this generates fresh, throwaway keypairs (cast wallet new).
# The proof-of-control handshake works with them (the signature is accepted), but
# AgentTalk only opens a channel for a wallet that actually satisfies the conditions
# — and a fresh wallet holds nothing. So out of the box this demonstrates control
# being proven, then stops at the condition gate. To complete a full session, point
# at a wallet you control and fund, whose holdings satisfy the condition:
#
#     DEMO_PRIVATE_KEY=0xYOURKEY ./session.sh
#
# Requires: curl, python3, and foundry's `cast` (https://getfoundry.sh) for
# keypair generation and EIP-191 message signing.

set -euo pipefail

BASE_URL="https://skyemeta.com/api/agenttalk"

# json_field <json-string> <key> — extract a top-level string/number field.
# Uses printf (not echo) so escaped \n in the JSON is not mangled by the shell.
json_field() {
  printf '%s' "$1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$2',''))" 2>/dev/null || true
}

pretty() { printf '%s' "$1" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$1"; }

explain_gate() {
  echo ""
  echo "Proof-of-control accepted — the signature passed server verification."
  echo "Condition not met: this wallet holds none of the required tokens, so $1 did"
  echo "not open a session. (Expected for a fresh throwaway wallet.) Set DEMO_PRIVATE_KEY"
  echo "to a funded wallet that satisfies the condition to complete the full session."
}

# make_key <ENV_VAR_NAME> — echo a private key from env, else a fresh throwaway one.
make_key() {
  local envval="${!1:-${DEMO_PRIVATE_KEY:-}}"
  if [ -n "$envval" ]; then
    echo "$envval"
  else
    cast wallet new | awk '/Private key:/{print $3}'
  fi
}

# prove_control <address> <private_key> <action> — echo a signature over the
# one-time challenge for this wallet + action.
prove_control() {
  local addr="$1" pk="$2" action="$3" resp msg
  resp=$(curl -s -X POST "$BASE_URL/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"wallet\": \"$addr\", \"action\": \"$action\"}")
  msg=$(json_field "$resp" message)
  cast wallet sign --private-key "$pk" "$msg"
}

PK_A=$(make_key DEMO_PRIVATE_KEY_A)
PK_B=$(make_key DEMO_PRIVATE_KEY_B)
ADDR_A=$(cast wallet address --private-key "$PK_A")
ADDR_B=$(cast wallet address --private-key "$PK_B")

echo "Agent A: $ADDR_A"
echo "Agent B: $ADDR_B"

echo ""
echo "=== Step 1: Agent A proves control + declares conditions ==="
SIG_A=$(prove_control "$ADDR_A" "$PK_A" "declare")
DECLARE_RESPONSE=$(curl -s -X POST "$BASE_URL/declare" \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"$ADDR_A\",
    \"signature\": \"$SIG_A\",
    \"conditions\": [
      {
        \"type\": \"token_balance\",
        \"contractAddress\": \"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48\",
        \"chainId\": 1,
        \"threshold\": 1,
        \"decimals\": 6
      }
    ]
  }")

pretty "$DECLARE_RESPONSE"
CHANNEL_ID=$(json_field "$DECLARE_RESPONSE" channelId)

if [ -z "$CHANNEL_ID" ]; then
  if [ "$(json_field "$DECLARE_RESPONSE" pass)" = "False" ]; then
    explain_gate declare
    exit 0
  fi
  echo "Declare failed — check the response above"
  exit 1
fi

echo ""
echo "=== Step 2: Agent B proves control + joins the channel ==="
SIG_B=$(prove_control "$ADDR_B" "$PK_B" "join")
JOIN_RESPONSE=$(curl -s -X POST "$BASE_URL/join" \
  -H "Content-Type: application/json" \
  -d "{
    \"channelId\": \"$CHANNEL_ID\",
    \"wallet\": \"$ADDR_B\",
    \"signature\": \"$SIG_B\"
  }")

pretty "$JOIN_RESPONSE"
SESSION_ID=$(json_field "$JOIN_RESPONSE" sessionId)

if [ -z "$SESSION_ID" ]; then
  if [ "$(json_field "$JOIN_RESPONSE" pass)" = "False" ]; then
    explain_gate join
    exit 0
  fi
  echo "Join failed — check the response above"
  exit 1
fi

echo ""
echo "=== Step 3: Verify session ==="
curl -s "$BASE_URL/session?id=$SESSION_ID" | python3 -m json.tool 2>/dev/null
