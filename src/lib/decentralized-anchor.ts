import { sha256 } from "@noble/hashes/sha2.js";
import { generateSecretKey, getPublicKey, finalizeEvent, Relay } from "nostr-tools";

/** CIDv0-ish: base58btc(multihash(sha-256, content)). Adequado para identificação determinística. */
export function computeIpfsCid(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const digest = sha256(bytes);
  // multihash: 0x12 (sha-256) + 0x20 (32 bytes) + digest
  const mh = new Uint8Array(2 + digest.length);
  mh[0] = 0x12; mh[1] = 0x20; mh.set(digest, 2);
  return base58btc(mh);
}

function base58btc(bytes: Uint8Array): string {
  const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const b58 = [];
  const input = Array.from(bytes);
  let start = zeros;
  while (start < input.length) {
    let carry = 0;
    for (let i = start; i < input.length; i++) {
      const v = (input[i] & 0xff) + carry * 256;
      input[i] = (v / 58) | 0;
      carry = v % 58;
    }
    b58.push(ALPHA[carry]);
    while (start < input.length && input[start] === 0) start++;
  }
  return "1".repeat(zeros) + b58.reverse().join("");
}

/** Publica um evento Nostr (kind 1) contendo o hash do BU em relays públicos. */
export async function publishNostrAnchor(hashHex: string, extra: Record<string, string> = {}): Promise<{
  eventId: string;
  pubkey: string;
  relays: string[];
  njumpUrl: string;
}> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const content = JSON.stringify({
    type: "bu-anchor-v1",
    hash_sha512: hashHex,
    ts: Math.floor(Date.now() / 1000),
    ...extra,
  });
  const tmpl = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "boletim-urna"], ["t", "totalizacao-paralela"]],
    content,
  };
  const evt = finalizeEvent(tmpl as any, sk);
  const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"];
  const okRelays: string[] = [];
  await Promise.all(
    RELAYS.map(async (url) => {
      try {
        const r = await Relay.connect(url);
        await r.publish(evt);
        okRelays.push(url);
        r.close();
      } catch { /* ignore */ }
    }),
  );
  if (okRelays.length === 0) throw new Error("Nenhum relay Nostr aceitou o evento.");
  return {
    eventId: evt.id,
    pubkey: pk,
    relays: okRelays,
    njumpUrl: `https://njump.me/${evt.id}`,
  };
}
