# AgentTalk

**Wallet auth for agent-to-agent communication.**

OAuth proves who you are. API keys prove you have permission. AgentTalk proves what you hold — on-chain, across 33 blockchains, cryptographically signed, verifiable by anyone.

Before two agents exchange data, both verify their wallets satisfy the same conditions. Token balances, NFT ownership, compliance attestations — whatever the use case requires. The blockchain state is the credential. Sell your tokens, lose your session. No secrets to share. No identity to verify first. No static credentials that expire or get leaked.

Three API calls to a mutual session. [Try it free](https://skyemeta.com/agenttalk/) — 10 calls per wallet, no signup.

## Why Not OAuth?

Agent protocols today authenticate agents the same way we authenticate humans: API keys, OAuth tokens, mTLS certificates. These prove *identity* — "this agent has permission to be here."

But for agent commerce, DeFi coordination, and governance workflows, the question isn't who you are. It's **what you hold**. A procurement agent negotiating a $1M deal should prove it represents a wallet with $1M — not just that it has a valid OAuth token.

AgentTalk is [condition-based access](https://insumermodel.com/how-it-works/) for the agent layer. You define conditions. Both agents are evaluated against live blockchain state. The result is an ECDSA-signed boolean — pass or fail — not a balance dump. The signed attestation is verifiable offline via [JWKS](https://insumermodel.com/.well-known/jwks.json). No callback to us required.

| | AgentTalk | OAuth 2.0 | API Keys | mTLS |
|---|---|---|---|---|
| Proves what agent holds | Yes | No | No | No |
| Dynamic (sell token = lose access) | Yes | No | No | No |
| Multi-chain (33 blockchains) | Yes | No | No | No |
| Mutual verification (both sides) | Yes | No | No | Yes |
| Composable (up to 10 conditions) | Yes | No | No | No |
| No shared secrets | Yes | No | No | Yes |

## How It Works

Read the chain. Evaluate the conditions. Sign the result.

```
Agent A                          AgentTalk                         Agent B
   |                                |                                |
   |-- POST /declare (conditions) ->|                                |
   |<-- channelId, conditionsHash --|                                |
   |                                |                                |
   |                                |<-- POST /join (channelId) -----|
   |                                |--- sessionId, attestations --->|
   |                                |                                |
   |-- GET /session?id=ses_... ---->|                                |
   |<-- { valid: true, agents } ----|                                |
```

1. **Declare** — Agent A sets conditions across any of 33 chains. Its wallet is attested immediately.
2. **Join** — Agent B joins with its wallet. Both wallets are evaluated against the same conditions.
3. **Session** — If both pass, each agent gets an ECDSA-signed JWT (`ES256`, `kid: "insumer-attest-v1"`). Both can verify at any time.
4. **Re-verify** — Sessions can be re-attested on demand against current on-chain state. Dynamic enforcement, not a one-time check.

## Quick Start

```bash
# 1. Declare conditions (free tier — no API key needed)
curl -X POST https://skyemeta.com/api/agenttalk/declare \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "0xAgentA...",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1,
        "threshold": 1000000,
        "decimals": 6
      }
    ]
  }'
# Returns: { "channelId": "ch_...", "conditionsHash": "0x...", "expiresAt": "..." }

# 2. Join (no API key — creator pays both sides)
curl -X POST https://skyemeta.com/api/agenttalk/join \
  -H "Content-Type: application/json" \
  -d '{ "channelId": "ch_...", "wallet": "0xAgentB..." }'
# Returns: { "sessionId": "ses_...", "agents": [{ wallet, attestation }, ...] }

# 3. Verify
curl "https://skyemeta.com/api/agenttalk/session?id=ses_..."
# Returns: { "valid": true, "agents": [...], "conditions": [...] }
```

See [`examples/`](examples/) for complete scripts in bash, Python, and JavaScript.

## Use Cases

- **Supply Chain Negotiation** — Two procurement agents verify they each hold $1M+ USDC before sharing pricing data. On-chain proof of financial capacity, not a signed NDA.
- **Financial Agent Coordination** — A portfolio agent only shares allocation data with agents holding specific governance tokens. Attestation replaces allow-lists.
- **Compliance-Gated Data Exchange** — Agents verify each other holds compliance attestation NFTs (e.g., EAS credentials). Revoke the NFT, close the session.
- **Cross-Org Workflow Automation** — DAO-to-DAO agents verify governance token holdings before executing joint proposals. On-chain qualification replaces manual approval chains.

## Condition Types

Conditions are evaluated by [InsumerAPI](https://insumermodel.com/developers/api-reference/) against live blockchain state.

**`token_balance`** — Does the wallet hold at least X tokens?
```json
{ "type": "token_balance", "contractAddress": "0xA0b86991...", "chainId": 1, "threshold": 1000000, "decimals": 6 }
```
Use `"native"` for ETH, BNB, MATIC, SOL, XRP, BTC, etc.

**`nft_ownership`** — Does the wallet hold this NFT?
```json
{ "type": "nft_ownership", "contractAddress": "0xBC4CA0Ed...", "chainId": 1 }
```

**`eas_attestation`** — Does the wallet have a valid on-chain attestation?
```json
{ "type": "eas_attestation", "template": "gitcoin-passport-v2" }
```

Up to 10 conditions per channel. All must pass (AND logic). 33 blockchains: Ethereum, Bitcoin, Solana, XRP Ledger, Polygon, Base, Arbitrum, Optimism, Avalanche, BNB Chain, and 23 more.

## Verification

Every attestation is an ES256 JWT signed with `kid: "insumer-attest-v1"`. Verify offline — no network call needed after the initial attestation:

```
GET https://insumermodel.com/.well-known/jwks.json
```

Works with any standard JWT library: jose, jsonwebtoken, Kong, Nginx, AWS API Gateway. Each condition produces a `conditionHash` (SHA-256 of canonical JSON), so verifiers can confirm exactly which conditions were checked without seeing raw balances.

## API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/agenttalk/declare` | POST | `x-api-key` or free tier | Create a condition-gated channel |
| `/api/agenttalk/join` | POST | None (creator pays) | Join a channel, create mutual session |
| `/api/agenttalk/session` | GET | None | Check session validity |
| `/api/agenttalk/session` | POST | None (creator pays) | Re-verify both wallets against current state |

Full request/response details: [skyemeta.com/agenttalk](https://skyemeta.com/agenttalk/)

## Discovery

```
GET https://skyemeta.com/.well-known/agents.json
```

## Pricing

| Tier | Rate | Spend |
|------|------|-------|
| Starter | 25 credits/$1 | $5–$99 |
| Growth | 33 credits/$1 | $100–$499 |
| Scale | 50 credits/$1 | $500+ |

Each session = 2 credits (one per agent). Creator pays both sides. **Free tier: 10 calls per wallet, no key needed.**

Pay with USDC, USDT, or BTC. No signup. See [skyemeta.com/agenttalk](https://skyemeta.com/agenttalk/) for details.

## Protocols

AgentTalk implements wallet auth as the qualification layer for agent communication protocols:

- **A2A** — Wallet qualification for agent discovery and Agent Cards
- **MCP** — Condition-based tool gating via MCP parameters
- **ACP** — Wallet attestation as the agent handshake layer
- **x402** — Proof-of-holdings alongside proof-of-payment

## Related

- [InsumerAPI](https://insumermodel.com/developers/) — The wallet auth engine. Read the chain, evaluate conditions, sign the result.
- [insumer-verify](https://www.npmjs.com/package/insumer-verify) — Offline JWT verification. Zero dependencies.
- [SkyeGate](https://skyemeta.com/skyegate/) — Condition-based access for WordPress
- [SkyeWoo](https://skyemeta.com/skyewoo/) — Condition-based access for WooCommerce

## License

MIT
