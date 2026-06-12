/**
 * Parser de QR Codes do Boletim de Urna (TSE).
 * Baseado no Manual TSE — QR Code no BU (2024, aplicável a 2026).
 *
 * Suporta:
 *  - Cabeçalho QRBU/VRQR/VRCH
 *  - Campos chave:valor (4 letras maiúsculas + dígitos opcionais)
 *  - Tokens de candidato/resposta no formato bare `nnnnn:nnnn` agrupados por CARG e PART
 *  - Cadeia cumulativa de HASH (SHA-512 hex), conforme §6.1
 *  - ASSI no último QR
 */

import { sha512 } from "@noble/hashes/sha2.js";

export interface QRMeta {
  idx: number;
  total: number;
  hash: string;
  hash_valido?: boolean;
}

export interface VotoCandidato {
  numero: number;
  votos: number;
  partido?: number;
}

export interface VotoCargo {
  codigo: number;
  tipo?: number;
  candidatos: VotoCandidato[];
  brancos: number;
  nulos: number;
  nominais: number;
  legenda: number;
  aptos: number;
  total: number;
}

export interface ParsedBU {
  campos: Record<string, string>;
  conteudo_completo: string;
  hash_final: string;
  assinatura: string;
  qr_meta: QRMeta[];
  votos: { cargos: VotoCargo[] };
  erro: string | null;
  cadeia_hash_valida: boolean;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex impar");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CABECALHO_KEYS = new Set([
  "QRBU","VRQR","VRCH","ORIG","ORLC","PROC","DTPL","PLEI","TURN","FASE","UNFE",
  "MUNI","ZONA","SECA","AGRE","IDUE","IDCA","HIQT","HICA","VERS",
  "LOCA","APTO","APTS","APTT","COMP","FALT","HBBM","HBBG","HBSB",
  "DTAB","HRAB","DTFC","HRFC","JUNT","TURM","DTEM","HREM",
  "IDEL","MAJO","PROP",
  "CARG","TIPO","VERC","PART","LEGP","TOTP",
  "APTA","CSEC","NOMI","LEGC","BRAN","NULO","TOTC",
  "HASH","ASSI",
]);

function parseCampos(s: string): Record<string, string> {
  const r: Record<string, string> = {};
  const re = /\b([A-Z]{3,4}):(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (CABECALHO_KEYS.has(m[1])) r[m[1]] = m[2];
  }
  return r;
}

/** Tokens são separados por whitespace; um token é "CHAVE:VALOR" */
function tokenize(conteudo: string): string[] {
  return conteudo.split(/\s+/).filter(Boolean);
}

/** State machine sobre tokens — produz a lista de cargos com candidatos e totais. */
function extrairVotos(conteudo: string): { cargos: VotoCargo[] } {
  const tokens = tokenize(conteudo);
  const cargos: VotoCargo[] = [];
  let cargo: VotoCargo | null = null;
  let partidoAtual: number | null = null;

  const numero = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  };

  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon < 1) continue;
    const k = tok.slice(0, colon);
    const v = tok.slice(colon + 1);

    if (k === "CARG") {
      if (cargo) cargos.push(cargo);
      cargo = { codigo: numero(v), candidatos: [], brancos: 0, nulos: 0, nominais: 0, legenda: 0, aptos: 0, total: 0 };
      partidoAtual = null;
      continue;
    }
    if (!cargo) continue;

    switch (k) {
      case "TIPO": cargo.tipo = numero(v); break;
      case "VERC": break;
      case "PART": partidoAtual = numero(v); break;
      case "LEGP": cargo.legenda += numero(v); break;
      case "TOTP": break;
      case "APTA": cargo.aptos = numero(v); break;
      case "APTS":
      case "APTT":
      case "CSEC": break;
      case "NOMI": cargo.nominais = numero(v); break;
      case "LEGC": cargo.legenda = numero(v); break;
      case "BRAN": cargo.brancos = numero(v); break;
      case "NULO": cargo.nulos = numero(v); break;
      case "TOTC": cargo.total = numero(v); break;
      default: {
        // Candidato/resposta: token bare nnnnn:nnnn (chave 100% numérica)
        if (/^\d+$/.test(k) && /^\d+$/.test(v)) {
          cargo.candidatos.push({ numero: numero(k), votos: numero(v), partido: partidoAtual ?? undefined });
        }
        break;
      }
    }
  }
  if (cargo) cargos.push(cargo);

  // Se TOTC não veio, calcula
  for (const c of cargos) {
    if (!c.total) c.total = c.candidatos.reduce((s, x) => s + x.votos, 0) + c.brancos + c.nulos;
  }
  return { cargos };
}

const cabRe = /^QRBU:\d+:\d+\s+VRQR:\S+\s+VRCH:\S+\s+/;
const hashRe = /\s+HASH:([A-Fa-f0-9]+)(?:\s+ASSI:([A-Fa-f0-9]+))?$/;

/**
 * Parseia uma sequência de QR Codes do BU.
 * Valida a cadeia cumulativa de hashes (§6.1 do manual).
 */
export function parseQRs(qrs: string[]): ParsedBU {
  const empty: ParsedBU = {
    campos: {}, conteudo_completo: "", hash_final: "", assinatura: "",
    qr_meta: [], votos: { cargos: [] }, erro: null, cadeia_hash_valida: false,
  };

  if (!qrs || qrs.length === 0) return { ...empty, erro: "Nenhum QR Code fornecido." };

  const sorted = [...qrs].map((s) => s.trim()).sort((a, b) => {
    const na = parseInt(a.match(/QRBU:(\d+):/)?.[1] ?? "1", 10);
    const nb = parseInt(b.match(/QRBU:(\d+):/)?.[1] ?? "1", 10);
    return na - nb;
  });

  const totalMatch = sorted[0].match(/QRBU:\d+:(\d+)/);
  const total = parseInt(totalMatch?.[1] ?? "1", 10);
  if (sorted.length !== total) return { ...empty, erro: `BU incompleto: esperados ${total} QR Codes, recebidos ${sorted.length}.` };

  let conteudo_acumulado = "";
  let hash_final = "";
  let assinatura = "";
  const campos: Record<string, string> = {};
  const qr_meta: QRMeta[] = [];
  let cadeia_ok = true;

  for (let i = 0; i < sorted.length; i++) {
    const qr = sorted[i];
    const hashMatch = qr.match(hashRe);
    if (!hashMatch) return { ...empty, erro: `QR ${i + 1} sem campo HASH.` };

    const hash_qr = hashMatch[1].toLowerCase();
    if (i === sorted.length - 1) {
      hash_final = hash_qr;
      assinatura = (hashMatch[2] ?? "").toLowerCase();
    }

    const semCab = qr.replace(cabRe, "");
    const dados = semCab.replace(hashRe, "");

    // Conteúdo conforme §6.1: dadosᵢ concatenados ao conteúdo acumulado, com HASHᵢ
    const proximo = i === 0 ? `${dados} HASH:${hash_qr}` : `${conteudo_acumulado} ${dados} HASH:${hash_qr}`;

    // Verifica cadeia: hash_qr = SHA-512( conteudo_acumulado_anterior + " " + dados )  (i>0)
    // ou SHA-512(dados) para i=0
    const aHashear = i === 0 ? dados : `${conteudo_acumulado} ${dados}`;
    let hash_computado = "";
    try {
      hash_computado = bytesToHex(sha512(new TextEncoder().encode(aHashear))).toLowerCase();
    } catch { hash_computado = ""; }
    const hash_valido = hash_computado === hash_qr;
    if (!hash_valido) cadeia_ok = false;
    qr_meta.push({ idx: i + 1, total, hash: hash_qr, hash_valido });

    conteudo_acumulado = proximo;
    Object.assign(campos, parseCampos(dados));
  }

  const votos = extrairVotos(conteudo_acumulado);

  return { campos, conteudo_completo: conteudo_acumulado, hash_final, assinatura, qr_meta, votos, erro: null, cadeia_hash_valida: cadeia_ok };
}
