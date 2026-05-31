/**
 * Parser de QR Codes do Boletim de Urna (TSE).
 * Baseado no Manual TSE — QR Code no BU 2024 (compatível com 2026).
 *
 * Limitações da v1:
 * - Faz parsing do cabeçalho e dos campos chave:valor.
 * - Extração estruturada de votos por cargo/candidato é best-effort
 *   e deve ser refinada com amostras reais de BUs antes de produção.
 */

export interface QRMeta {
  idx: number;
  total: number;
  hash: string;
}

export interface ParsedBU {
  campos: Record<string, string>;
  conteudo_completo: string;
  hash_final: string;
  assinatura: string;
  qr_meta: QRMeta[];
  votos: { cargos: VotoCargo[] };
  erro: string | null;
}

export interface VotoCandidato {
  numero: number;
  votos: number;
}

export interface VotoCargo {
  codigo: number;
  candidatos: VotoCandidato[];
  brancos: number;
  nulos: number;
  total: number;
}

/** Converte hex string -> Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parseia "CHAVE:VALOR CHAVE2:VALOR2 ..." em objeto */
function parseCampos(s: string): Record<string, string> {
  const r: Record<string, string> = {};
  const re = /\b([A-Z]{2,6}):(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    r[m[1]] = m[2];
  }
  return r;
}

/**
 * Extrai estrutura de votos do conteúdo.
 * NOTA: implementação simplificada que reconhece padrões CARG, CAND, VOTO.
 * Refinar com amostras reais de BUs do TSE.
 */
function extrairVotos(conteudo: string): { cargos: VotoCargo[] } {
  const cargos: VotoCargo[] = [];
  // Heurística: procura blocos CARG:<codigo> seguidos de CAND:<num> VOTO:<qtd>
  // O formato real do TSE usa state machine sobre tokens; aqui é best-effort.
  const blocos = conteudo.split(/CARG:/);
  for (let i = 1; i < blocos.length; i++) {
    const bloco = blocos[i];
    const codigoMatch = bloco.match(/^(\d+)/);
    if (!codigoMatch) continue;
    const codigo = parseInt(codigoMatch[1], 10);

    const candidatos: VotoCandidato[] = [];
    const reCand = /CAND:(\d+)\s+VOTO:(\d+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = reCand.exec(bloco)) !== null) {
      candidatos.push({ numero: parseInt(cm[1], 10), votos: parseInt(cm[2], 10) });
    }

    const brancos = parseInt(bloco.match(/BRAN:(\d+)/)?.[1] ?? "0", 10);
    const nulos = parseInt(bloco.match(/NULO:(\d+)/)?.[1] ?? "0", 10);
    const total = candidatos.reduce((s, c) => s + c.votos, 0) + brancos + nulos;

    cargos.push({ codigo, candidatos, brancos, nulos, total });
  }
  return { cargos };
}

/**
 * Parseia uma sequência de QR Codes do BU.
 * Cada QR tem formato:
 *   QRBU:n:x VRQR:y.z VRCH:vvv [dados] HASH:xxxx [ASSI:xxxx]
 */
export function parseQRs(qrs: string[]): ParsedBU {
  const empty: ParsedBU = {
    campos: {},
    conteudo_completo: "",
    hash_final: "",
    assinatura: "",
    qr_meta: [],
    votos: { cargos: [] },
    erro: null,
  };

  if (!qrs || qrs.length === 0) {
    return { ...empty, erro: "Nenhum QR Code fornecido." };
  }

  // Ordena por índice
  const sorted = [...qrs].sort((a, b) => {
    const na = parseInt(a.match(/QRBU:(\d+):/)?.[1] ?? "1", 10);
    const nb = parseInt(b.match(/QRBU:(\d+):/)?.[1] ?? "1", 10);
    return na - nb;
  });

  const totalMatch = sorted[0].match(/QRBU:\d+:(\d+)/);
  const total = parseInt(totalMatch?.[1] ?? "1", 10);
  if (sorted.length !== total) {
    return { ...empty, erro: `BU incompleto: esperados ${total} QR Codes, recebidos ${sorted.length}.` };
  }

  let conteudo_acumulado = "";
  let hash_final = "";
  let assinatura = "";
  const campos: Record<string, string> = {};
  const qr_meta: QRMeta[] = [];

  const cabRe = /^QRBU:\d+:\d+\s+VRQR:\S+\s+VRCH:\S+\s+/;
  const hashRe = /\s+HASH:([A-Fa-f0-9]+)(?:\s+ASSI:([A-Fa-f0-9]+))?$/;

  for (let i = 0; i < sorted.length; i++) {
    const qr = sorted[i];
    const hashMatch = qr.match(hashRe);
    if (!hashMatch) {
      return { ...empty, erro: `QR ${i + 1} sem campo HASH.` };
    }
    const hash_qr = hashMatch[1];
    if (i === sorted.length - 1) {
      hash_final = hash_qr.toLowerCase();
      assinatura = (hashMatch[2] ?? "").toLowerCase();
    }
    const semCab = qr.replace(cabRe, "");
    const dados = semCab.replace(hashRe, "");
    qr_meta.push({ idx: i + 1, total, hash: hash_qr });

    if (i === 0) {
      conteudo_acumulado = `${dados} HASH:${hash_qr}`;
    } else {
      conteudo_acumulado = `${conteudo_acumulado} ${dados} HASH:${hash_qr}`;
    }

    Object.assign(campos, parseCampos(dados));
  }

  const votos = extrairVotos(conteudo_acumulado);

  return { campos, conteudo_completo: conteudo_acumulado, hash_final, assinatura, qr_meta, votos, erro: null };
}
