"""
AgentTalk — full session flow (prove control -> declare -> join -> verify -> re-verify)
Uses the free tier (no API key needed for first 10 calls per wallet)

Proof-of-control: on-chain holdings are public, so before any action an agent
signs a one-time challenge with its wallet key. Control of the wallet — not
knowledge of its address — is what grants entry.

Wallets: by default this generates fresh, throwaway keypairs. The proof-of-control
handshake works with them (the signature is accepted), but AgentTalk only opens a
channel for a wallet that actually satisfies the conditions — and a fresh wallet
holds nothing. So out of the box this demonstrates control being proven, then stops
at the condition gate. To complete a full session, point at a wallet you control and
fund, whose holdings satisfy the condition:

    DEMO_PRIVATE_KEY=0xYOURKEY python session.py

The key is read only at runtime and never leaves your machine.

Install: pip install requests eth-account
Run:     python session.py
"""

from __future__ import annotations

import json
import os

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

BASE_URL = "https://skyemeta.com/api/agenttalk"


def make_account(env_name: str):
    """A wallet from an env-supplied private key, or a fresh throwaway one."""
    pk = os.environ.get(env_name) or os.environ.get("DEMO_PRIVATE_KEY")
    return Account.from_key(pk) if pk else Account.create()


def prove_control(account, action: str) -> str:
    """Fetch a one-time challenge, sign the message (EIP-191), return the 0x signature."""
    resp = requests.post(
        f"{BASE_URL}/challenge",
        json={"wallet": account.address, "action": action},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    message = resp.json()["message"]
    signed = Account.sign_message(encode_defunct(text=message), account.key)
    sig = signed.signature.hex()
    return sig if sig.startswith("0x") else "0x" + sig  # eth-account may omit 0x


def declare_channel(account, conditions: list, api_key: str | None = None) -> requests.Response:
    """Agent A proves control, then declares conditions for a channel."""
    signature = prove_control(account, "declare")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    body = {"wallet": account.address, "signature": signature, "conditions": conditions}
    return requests.post(f"{BASE_URL}/declare", json=body, headers=headers)


def join_channel(channel_id: str, account) -> requests.Response:
    """Agent B proves control, then joins. No API key needed — creator pays both sides."""
    signature = prove_control(account, "join")
    return requests.post(
        f"{BASE_URL}/join",
        json={"channelId": channel_id, "wallet": account.address, "signature": signature},
        headers={"Content-Type": "application/json"},
    )


def verify_session(session_id: str) -> dict:
    """Check if a session is still valid."""
    resp = requests.get(f"{BASE_URL}/session", params={"id": session_id})
    resp.raise_for_status()
    return resp.json()


def reverify_session(session_id: str) -> dict:
    """Re-attest both wallets against current on-chain state (no signature needed —
    control was proven at join; re-verify only ever removes wallets that stop qualifying)."""
    resp = requests.post(
        f"{BASE_URL}/session",
        json={"sessionId": session_id},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


def explain_gate(label: str) -> None:
    """A 403 pass:false means control was proven but the wallet doesn't hold the tokens."""
    print(f"\nProof-of-control accepted — the signature passed server verification.")
    print(f"Condition not met: this wallet holds none of the required tokens, so {label}")
    print("did not open a session. (Expected for a fresh throwaway wallet.) Set")
    print("DEMO_PRIVATE_KEY to a funded wallet that satisfies the condition to complete.")


if __name__ == "__main__":
    agent_a = make_account("DEMO_PRIVATE_KEY_A")
    agent_b = make_account("DEMO_PRIVATE_KEY_B")

    # Condition: wallet holds >= 1 USDC on Ethereum
    conditions = [
        {
            "type": "token_balance",
            "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "chainId": 1,
            "threshold": 1,
            "decimals": 6,
        }
    ]

    print(f"Agent A: {agent_a.address}")
    print(f"Agent B: {agent_b.address}")

    print("\n=== Step 1: Prove control + declare channel ===")
    declare_resp = declare_channel(agent_a, conditions)
    print(f"HTTP {declare_resp.status_code}: {declare_resp.text}")
    channel = declare_resp.json() if declare_resp.ok else {}
    if not channel.get("channelId"):
        if declare_resp.status_code == 403:
            explain_gate("declare")
        raise SystemExit(0)

    print("\n=== Step 2: Prove control + join channel ===")
    join_resp = join_channel(channel["channelId"], agent_b)
    print(f"HTTP {join_resp.status_code}: {join_resp.text}")
    session = join_resp.json() if join_resp.ok else {}
    if not session.get("sessionId"):
        if join_resp.status_code == 403:
            explain_gate("join")
        raise SystemExit(0)

    print("\n=== Step 3: Verify session ===")
    print(json.dumps(verify_session(session["sessionId"]), indent=2))

    print("\n=== Step 4: Re-verify (checks current on-chain state) ===")
    print(json.dumps(reverify_session(session["sessionId"]), indent=2))
