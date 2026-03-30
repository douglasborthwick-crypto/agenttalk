# AgentTalk

Condition-gated sessions for agent-to-agent communication. Both agents verify their wallets satisfy the same on-chain conditions before a session begins.

**Live at [skyemeta.com/agenttalk](https://skyemeta.com/agenttalk/)**

## How It Works

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

1. **Declare** — Agent A sets conditions (token balances, NFT ownership, EAS attestations) across any of 33 chains
2. **Join** — Agent B submits its wallet. Both wallets are verified against the conditions via [InsumerAPI](https://insumermodel.com)
3. **Session** — If both pass, each agent gets an ECDSA-signed attestation JWT (ES256, `kid: "insumer-attest-v1"`)
4. **Verify** — Either agent can check or re-verify the session at any time. Sell your tokens, lose your session

## Quick Start

```bash
# 1. Agent A declares conditions (free tier — no API key needed for first 10 calls)
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

# 2. Agent B joins (no API key needed — creator pays both sides)
curl -X POST https://skyemeta.com/api/agenttalk/join \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "ch_...",
    "wallet": "0xAgentB..."
  }'
# Returns: { "sessionId": "ses_...", "agents": [{ "wallet", "attestation" }, ...] }

# 3. Either agent verifies the session
curl "https://skyemeta.com/api/agenttalk/session?id=ses_..."
# Returns: { "valid": true, "agents": [...], "conditions": [...] }
```

## API Reference

### `POST /api/agenttalk/declare`

Create a condition-gated channel. Creator's wallet is attested on creation.

**Headers:**
- `x-api-key` (optional) — InsumerAPI key. Omit to use free tier (10 calls per wallet)

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wallet` | string | Yes | Creator's EVM wallet address |
| `conditions` | array | Yes | 1–10 condition objects (see [Condition Types](#condition-types)) |
| `solanaWallet` | string | No | Solana wallet address (if conditions target Solana) |
| `expiresIn` | number | No | Channel TTL in seconds (default: 3600) |

**Response:**

```json
{
  "channelId": "ch_a1b2c3d4e5f6...",
  "conditionsHash": "0x7f83b165...",
  "expiresAt": "2026-03-16T13:00:00.000Z"
}
```

### `POST /api/agenttalk/join`

Join a channel. Joiner's wallet is attested. If both agents pass, a session is created.

**No API key required.** The channel creator's key covers both attestations.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channelId` | string | Yes | Channel ID from declare response |
| `wallet` | string | Yes | Joiner's EVM wallet address |
| `solanaWallet` | string | No | Solana wallet address |

**Response:**

```json
{
  "sessionId": "ses_x9y8z7...",
  "expiresAt": "2026-03-16T13:00:00.000Z",
  "agents": [
    {
      "wallet": "0xabc123...",
      "attestation": {
        "attestation": { "id": "ATST-...", "pass": true, "results": [...] },
        "sig": "base64...",
        "kid": "insumer-attest-v1",
        "jwt": "eyJhbGciOiJFUzI1NiI..."
      }
    },
    {
      "wallet": "0xdef456...",
      "attestation": { "..." }
    }
  ]
}
```

### `GET /api/agenttalk/session`

Check if a session is still valid.

**Query params:** `id` — session ID

**Response:**

```json
{
  "valid": true,
  "agents": [
    { "wallet": "0x...", "attestation": { "..." } },
    { "wallet": "0x...", "attestation": { "..." } }
  ],
  "conditions": [...],
  "issuedAt": "2026-03-16T12:00:00.000Z",
  "expiresAt": "2026-03-16T13:00:00.000Z"
}
```

### `POST /api/agenttalk/session`

Re-verify a session. Both wallets are re-attested against current on-chain state. If either agent no longer qualifies, the session is invalidated and deleted.

**Body:** `{ "sessionId": "ses_..." }`

**Response:** Same shape as GET. Returns `{ "valid": false }` if either agent fails.

## Condition Types

Each condition in the `conditions` array is evaluated by [InsumerAPI](https://insumermodel.com/developers/api-reference/).

### `token_balance`

```json
{
  "type": "token_balance",
  "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "chainId": 1,
  "threshold": 1000000,
  "decimals": 6
}
```

Use `"native"` as `contractAddress` for ETH, BNB, MATIC, XRP, BTC, etc.

### `nft_ownership`

```json
{
  "type": "nft_ownership",
  "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "chainId": 1
}
```

### `eas_attestation`

```json
{
  "type": "eas_attestation",
  "schemaId": "0x...",
  "chainId": 1
}
```

Or use a pre-configured template (e.g., Gitcoin Passport):

```json
{
  "type": "eas_attestation",
  "template": "gitcoin-passport-v2"
}
```

## Supported Chains

33 blockchains: Ethereum, Bitcoin, Solana, XRP Ledger, Polygon, Base, Arbitrum, Optimism, Avalanche, BNB Chain, Sonic, Gnosis, Mantle, Scroll, Linea, ZKsync, Blast, Celo, Moonbeam, opBNB, Unichain, Ink, Sei, Berachain, ApeChain, Soneium, World Chain, Taiko, Ronin, Moonriver, Viction, Chiliz, Plume.

## Verification

Attestation JWTs are ES256-signed with `kid: "insumer-attest-v1"`. Verify offline via JWKS:

```
GET https://api.insumermodel.com/v1/jwks
```

Or the static endpoint:

```
GET https://insumermodel.com/.well-known/jwks.json
```

Any standard JWT library (jose, jsonwebtoken, Kong, Nginx, Cloudflare Access, AWS API Gateway) can verify without calling back to us.

Each condition produces a `conditionHash` — the SHA-256 of the canonical sorted-key JSON of the evaluated condition. This lets verifiers confirm exactly which conditions were checked without seeing raw balances.

## Discovery

Agent discovery file at [`skyemeta.com/.well-known/agents.json`](https://skyemeta.com/.well-known/agents.json).

## Pricing

| Tier | Rate | Spend |
|------|------|-------|
| Starter | 25 credits/$1 | $5–$99 |
| Growth | 33 credits/$1 | $100–$499 |
| Scale | 50 credits/$1 | $500+ |

Each session uses 2 credits (one attestation per agent). Creator pays both sides. **Free tier: 10 calls per wallet, no key needed.**

Payment: send USDC, USDT, or BTC to the payment wallet, then call `POST /api/agenttalk/buy-key` with the transaction hash. Key returned immediately. No signup, no email, no credit cards. Minimum $5.

See [skyemeta.com/agenttalk](https://skyemeta.com/agenttalk/) for payment wallet addresses and full details.

## Use Cases

- **Supply Chain Negotiation** — Two procurement agents verify they each hold $1M+ USDC before sharing pricing data
- **Financial Agent Coordination** — A portfolio agent only shares allocations with agents holding specific governance tokens
- **Compliance-Gated Data Exchange** — Agents verify each other holds compliance attestation NFTs (e.g., EAS credentials)
- **Cross-Org Workflow Automation** — DAO-to-DAO agents verify governance token holdings before executing joint proposals

## How It Compares

| | AgentTalk | OAuth 2.0 | API Keys | mTLS |
|---|---|---|---|---|
| Proves what agent holds | Yes | No | No | No |
| Dynamic access | Yes | No | No | No |
| Multi-chain (33) | Yes | No | No | No |
| Mutual verification | Yes | No | No | Yes |
| Composable conditions | Yes | No | No | No |
| No shared secrets | Yes | No | No | Yes |
| Setup complexity | 3 API calls | Medium | Low | High |

## Related

- [InsumerAPI](https://insumermodel.com/developers/) — The wallet verification engine powering AgentTalk
- [insumer-verify](https://www.npmjs.com/package/insumer-verify) — npm package for offline JWT verification
- [SkyeGate](https://skyemeta.com/skyegate/) — Wallet-verified content for WordPress
- [SkyeWoo](https://skyemeta.com/skyewoo/) — Wallet-verified commerce for WooCommerce

## License

MIT
