/**
 * AgentTalk — full session flow (declare → join → verify → re-verify)
 * Uses the free tier (no API key needed for first 10 calls per wallet)
 *
 * Run: node session.js
 */

const BASE_URL = 'https://skyemeta.com/api/agenttalk';

// Replace with real wallet addresses
const AGENT_A_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const AGENT_B_WALLET = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

async function declareChannel(wallet, conditions, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`${BASE_URL}/declare`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ wallet, conditions }),
  });
  if (!res.ok) throw new Error(`declare failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function joinChannel(channelId, wallet) {
  // No API key needed — creator pays both sides
  const res = await fetch(`${BASE_URL}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, wallet }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function verifySession(sessionId) {
  const res = await fetch(`${BASE_URL}/session?id=${sessionId}`);
  if (!res.ok) throw new Error(`verify failed: ${res.status}`);
  return res.json();
}

async function reverifySession(sessionId) {
  // Re-attests both wallets against current on-chain state
  const res = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`reverify failed: ${res.status}`);
  return res.json();
}

async function main() {
  // Condition: wallet holds >= 1000 USDC on Ethereum
  const conditions = [
    {
      type: 'token_balance',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 1,
      threshold: 1000,
      decimals: 6,
    },
  ];

  console.log('=== Step 1: Declare channel ===');
  const channel = await declareChannel(AGENT_A_WALLET, conditions);
  console.log(JSON.stringify(channel, null, 2));

  console.log('\n=== Step 2: Join channel ===');
  const session = await joinChannel(channel.channelId, AGENT_B_WALLET);
  console.log(JSON.stringify(session, null, 2));

  console.log('\n=== Step 3: Verify session ===');
  const status = await verifySession(session.sessionId);
  console.log(JSON.stringify(status, null, 2));

  console.log('\n=== Step 4: Re-verify (checks current on-chain state) ===');
  const fresh = await reverifySession(session.sessionId);
  console.log(JSON.stringify(fresh, null, 2));
}

main().catch(console.error);
