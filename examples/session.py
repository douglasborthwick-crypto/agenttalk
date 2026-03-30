"""
AgentTalk — full session flow (declare → join → verify → re-verify)
Uses the free tier (no API key needed for first 10 calls per wallet)
"""

import json
import requests

BASE_URL = "https://skyemeta.com/api/agenttalk"

# Replace with real wallet addresses
AGENT_A_WALLET = "0x1234567890abcdef1234567890abcdef12345678"
AGENT_B_WALLET = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"


def declare_channel(wallet: str, conditions: list, api_key: str | None = None) -> dict:
    """Agent A declares conditions for a channel."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key

    body = {"wallet": wallet, "conditions": conditions}
    resp = requests.post(f"{BASE_URL}/declare", json=body, headers=headers)
    resp.raise_for_status()
    return resp.json()


def join_channel(channel_id: str, wallet: str) -> dict:
    """Agent B joins. No API key needed — creator pays both sides."""
    resp = requests.post(
        f"{BASE_URL}/join",
        json={"channelId": channel_id, "wallet": wallet},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


def verify_session(session_id: str) -> dict:
    """Check if a session is still valid."""
    resp = requests.get(f"{BASE_URL}/session", params={"id": session_id})
    resp.raise_for_status()
    return resp.json()


def reverify_session(session_id: str) -> dict:
    """Re-attest both wallets against current on-chain state."""
    resp = requests.post(
        f"{BASE_URL}/session",
        json={"sessionId": session_id},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    # Condition: wallet holds >= 1000 USDC on Ethereum
    conditions = [
        {
            "type": "token_balance",
            "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "chainId": 1,
            "threshold": 1000,
            "decimals": 6,
        }
    ]

    print("=== Step 1: Declare channel ===")
    channel = declare_channel(AGENT_A_WALLET, conditions)
    print(json.dumps(channel, indent=2))

    print("\n=== Step 2: Join channel ===")
    session = join_channel(channel["channelId"], AGENT_B_WALLET)
    print(json.dumps(session, indent=2))

    print("\n=== Step 3: Verify session ===")
    status = verify_session(session["sessionId"])
    print(json.dumps(status, indent=2))

    print("\n=== Step 4: Re-verify (checks current on-chain state) ===")
    fresh = reverify_session(session["sessionId"])
    print(json.dumps(fresh, indent=2))
