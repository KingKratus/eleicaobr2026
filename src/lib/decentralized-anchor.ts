import { sha256 } from "@noble/hashes/sha2.js";
import { generateSecretKey, getPublicKey, finalizeEvent, Relay } from "nostr-tools";

/** CIDv0: base58btc(multihash(sha-256, content)). Determinístico — qualquer
 *  republicação do mesmo payload no IPFS produz o mesmo CID. */
export function computeIpfsCid(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const digest = sha256(bytes);
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

export const IPFS_GATEWAYS = [
  { nome: "ipfs.io", url: (cid: string) => `https://ipfs.io/ipfs/${cid}` },
  { nome: "cloudflare", url: (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}` },
  { nome: "web3.storage", url: (cid: string) => `https://w3s.link/ipfs/${cid}` },
  { nome: "dweb.link", url: (cid: string) => `https://${cid}.ipfs.dweb.link/` },
];

/** Verifica se o conteúdo do CID está realmente disponível em algum gateway IPFS. */
export async function verifyIpfsCid(cid: string, timeoutMs = 5000): Promise<{
  cid: string;
  encontrado: { gateway: string; url: string } | null;
  tentativas: { gateway: string; status: number | string }[];
}> {
  const tentativas: { gateway: string; status: number | string }[] = [];
  for (const g of IPFS_GATEWAYS) {
    const url = g.url(cid);
    try {
      const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
      tentativas.push({ gateway: g.nome, status: r.status });
      if (r.ok) return { cid, encontrado: { gateway: g.nome, url }, tentativas };
    } catch (e: any) {
      tentativas.push({ gateway: g.nome, status: e.name === "TimeoutError" ? "timeout" : "fail" });
    }
  }
  return { cid, encontrado: null, tentativas };
}

const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://nostr.wine",
];

export const NOSTR_GATEWAYS = [
  { nome: "njump.me", url: (id: string) => `https://njump.me/${id}` },
  { nome: "primal.net", url: (id: string) => `https://primal.net/e/${id}` },
  { nome: "nostr.band", url: (id: string) => `https://nostr.band/${id}` },
];

/** Publica em vários relays Nostr; aguarda OK de cada um, com timeout individual. */
export async function publishNostrAnchor(hashHex: string, extra: Record<string, string> = {}): Promise<{
  eventId: string;
  pubkey: string;
  relays: string[];
  falhas: { relay: string; erro: string }[];
  njumpUrl: string;
  gateways: { nome: string; url: string }[];
}> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const content = JSON.stringify({
    type: "bu-anchor-v1",
    hash_sha512: hashHex,
    ts: Math.floor(Date.now() / 1000),
    ...extra,
  });
  const evt = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "boletim-urna"], ["t", "totalizacao-paralela"]],
    content,
  } as any, sk);

  const okRelays: string[] = [];
  const falhas: { relay: string; erro: string }[] = [];

  await Promise.all(
    NOSTR_RELAYS.map(async (url) => {
      let relay: Relay | null = null;
      try {
        relay = await Promise.race([
          Relay.connect(url),
          new Promise<Relay>((_, rej) => setTimeout(() => rej(new Error("connect timeout")), 5000)),
        ]);
        await Promise.race([
          relay.publish(evt),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error("publish timeout")), 6000)),
        ]);
        okRelays.push(url);
      } catch (e: any) {
        falhas.push({ relay: url, erro: e.message ?? "erro" });
      } finally {
        try { relay?.close(); } catch { /* ignore */ }
      }
    }),
  );

  if (okRelays.length === 0) {
    throw new Error(`Nenhum relay aceitou. Falhas: ${falhas.map((f) => `${f.relay}=${f.erro}`).join("; ")}`);
  }

  return {
    eventId: evt.id,
    pubkey: pk,
    relays: okRelays,
    falhas,
    njumpUrl: `https://njump.me/${evt.id}`,
    gateways: NOSTR_GATEWAYS.map((g) => ({ nome: g.nome, url: g.url(evt.id) })),
  };
}

/** Verifica via HTTP API se o evento está visível em índices Nostr públicos. */
export async function verifyNostrEvent(eventId: string): Promise<{
  encontrado: boolean;
  fonte?: string;
  evento?: any;
}> {
  try {
    const r = await fetch(`https://api.nostr.band/v0/event/${eventId}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const j = await r.json();
      return { encontrado: true, fonte: "nostr.band", evento: j };
    }
  } catch { /* ignore */ }
  return { encontrado: false };
}
