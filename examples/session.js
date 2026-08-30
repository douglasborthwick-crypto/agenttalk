/**
 * AgentTalk — full session flow (prove control → declare → join → verify → re-verify)
 * Uses the free tier (no API key needed for first 10 calls per wallet)
 *
 * Proof-of-control: on-chain holdings are public, so before any action an agent
 * signs a one-time challenge with its wallet key. Control of the wallet — not
 * knowledge of its address — is what grants entry.
 *
 * Wallets: by default this generates fresh, throwaway keypairs. The proof-of-control
 * handshake works with them (the signature is accepted), but AgentTalk only opens a
 * channel for a wallet that actually satisfies the conditions — and a fresh wallet
 * holds nothing. So out of the box this demonstrates control being proven, then stops
 * at the condition gate. To complete a full session, point at a wallet you control and
 * fund, whose holdings satisfy the condition:
 *
 *     DEMO_PRIVATE_KEY=0xYOURKEY node session.js
 *
 * The key is read only at runtime and never leaves your machine.
 *
 * Run: npm install && node session.js
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const BASE_URL = 'https://skyemeta.com/api/agenttalk';

// Fresh throwaway keypairs unless you supply your own funded ones via env.
const agentA = privateKeyToAccount(process.env.DEMO_PRIVATE_KEY_A || process.env.DEMO_PRIVATE_KEY || generatePrivateKey());
const agentB = privateKeyToAccount(process.env.DEMO_PRIVATE_KEY_B || generatePrivateKey());

// Prove control of `account` for `action`: fetch a one-time challenge, sign the
// returned message (EIP-191), return the signature.
async function proveControl(account, action) {
  const res = await fetch(`${BASE_URL}/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: account.address, action }),
  });
  if (!res.ok) throw new Error(`challenge failed: ${res.status} ${await res.text()}`);
  const { message } = await res.json();
  return account.signMessage({ message });
}

async function postJson(path, body, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function declareChannel(account, conditions, apiKey) {
  const signature = await proveControl(account, 'declare');
  return postJson('/declare', { wallet: account.address, signature, conditions }, apiKey);
}

async function joinChannel(channelId, account) {
  // No API key needed — creator pays both sides. Joiner still proves control.
  const signature = await proveControl(account, 'join');
  return postJson('/join', { channelId, wallet: account.address, signature });
}

async function verifySession(sessionId) {
  const res = await fetch(`${BASE_URL}/session?id=${sessionId}`);
  if (!res.ok) throw new Error(`verify failed: ${res.status}`);
  return res.json();
}

async function reverifySession(sessionId) {
  // Re-attests both wallets against current on-chain state (no signature needed —
  // control was proven at join; re-verify only ever removes wallets that stop qualifying).
  const res = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`reverify failed: ${res.status}`);
  return res.json();
}

// A 403 with pass:false means the signature was accepted (control proven) but the
// wallet doesn't satisfy the condition — expected for a fresh throwaway wallet.
function explainGate(label, res) {
  console.log(`\nProof-of-control accepted — the signature passed server verification.`);
  console.log(`Condition not met: this wallet holds none of the required tokens, so ${label}`);
  console.log(`did not open a session. (Expected for a fresh throwaway wallet.) Set`);
  console.log(`DEMO_PRIVATE_KEY to a funded wallet that satisfies the condition to complete.`);
}

async function main() {
  // Condition: wallet holds >= 1 USDC on Ethereum
  const conditions = [
    {
      type: 'token_balance',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 1,
      threshold: '1',
      decimals: 6,
    },
  ];

  console.log(`Agent A: ${agentA.address}`);
  console.log(`Agent B: ${agentB.address}`);

  console.log('\n=== Step 1: Prove control + declare channel ===');
  const channel = await declareChannel(agentA, conditions);
  console.log(`HTTP ${channel.status}: ${JSON.stringify(channel.data)}`);
  if (channel.status !== 200 || !channel.data.channelId) {
    if (channel.status === 403 && channel.data.pass === false) explainGate('declare', channel);
    return;
  }

  console.log('\n=== Step 2: Prove control + join channel ===');
  const session = await joinChannel(channel.data.channelId, agentB);
  console.log(`HTTP ${session.status}: ${JSON.stringify(session.data)}`);
  if (session.status !== 200 || !session.data.sessionId) {
    if (session.status === 403 && session.data.pass === false) explainGate('join', session);
    return;
  }

  console.log('\n=== Step 3: Verify session ===');
  const status = await verifySession(session.data.sessionId);
  console.log(JSON.stringify(status, null, 2));

  console.log('\n=== Step 4: Re-verify (checks current on-chain state) ===');
  const fresh = await reverifySession(session.data.sessionId);
  console.log(JSON.stringify(fresh, null, 2));
}

main().catch(console.error);
