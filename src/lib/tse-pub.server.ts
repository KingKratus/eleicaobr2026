import { sha512 } from "@noble/hashes/sha2.js";

export function toBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function sha512Hex(bytes: Uint8Array): string {
  return toHex(sha512(bytes));
}

export const VERSOES_CONHECIDAS: Record<number, string[]> = {
  2020: ["20201028", "2020.1"],
  2022: ["20220829", "20220920", "2022.1"],
  2024: ["20240507", "20240902", "20240905", "2024.1"],
  2026: ["2026.1", "20260901"],
};

export function urlPub(versao: string, tipo: string, fase: string, uf: string) {
  return `http://qrcodenobu.tse.jus.br/tse.qrcodebu/${versao}/${tipo}/${fase.toLowerCase()}${uf.toLowerCase()}qrcode.pub`;
}

/** Baixa um .pub oficial (32 bytes). Retorna null quando indisponível. */
export async function baixarPub(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "TotalizacaoParalela2026/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

export type ResultadoRevalidacao = "ok" | "divergente" | "indisponivel";

export interface LinhaRevalidacao {
  chave_id: number;
  ano_eleicao: number;
  sigla_uf: string;
  fase: string;
  resultado: ResultadoRevalidacao;
  detalhe: string;
}

/**
 * Percorre as chaves ativas com .pub gravado:
 *  1) recalcula o SHA-512 do conteúdo e compara com o hash oficial cadastrado;
 *  2) quando o TSE responde, rebaixa o .pub e compara byte a byte.
 * Marca `suspeita = true` em qualquer divergência e registra o histórico.
 */
export async function revalidarChavesCore(opts: { limite?: number; baixarDoTse?: boolean } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limite = opts.limite ?? 200;
  const baixar = opts.baixarDoTse ?? true;

  const { data: chaves, error } = await supabaseAdmin
    .from("chaves_tse")
    .select("id, ano_eleicao, sigla_uf, fase, tipo_eleicao, versao_chave, chave_publica_hex, hash_sha512_pub")
    .not("chave_publica_hex", "is", null)
    .limit(limite);

  if (error) return { ok: false, erro: error.message, linhas: [] as LinhaRevalidacao[] };

  const linhas: LinhaRevalidacao[] = [];
  const agora = new Date().toISOString();

  for (const c of chaves ?? []) {
    const hex = (c.chave_publica_hex ?? "").toLowerCase();
    const sha = sha512Hex(toBytes(hex));
    let resultado: ResultadoRevalidacao = "ok";
    let detalhe = "SHA-512 confere com o hash oficial cadastrado.";

    if (c.hash_sha512_pub && c.hash_sha512_pub.toLowerCase() !== sha) {
      resultado = "divergente";
      detalhe = `SHA-512 da chave gravada (${sha.slice(0, 24)}…) difere do hash oficial (${c.hash_sha512_pub.slice(0, 24)}…).`;
    } else if (!c.hash_sha512_pub) {
      detalhe = "Sem hash oficial de referência — apenas integridade interna verificada.";
    }

    if (resultado === "ok" && baixar) {
      const versoes = [c.versao_chave, ...(VERSOES_CONHECIDAS[c.ano_eleicao] ?? [])].filter(Boolean) as string[];
      let baixado: Uint8Array | null = null;
      let urlUsada = "";
      for (const v of Array.from(new Set(versoes))) {
        const url = urlPub(v, c.tipo_eleicao, c.fase, c.sigla_uf);
        baixado = await baixarPub(url);
        if (baixado) { urlUsada = url; break; }
      }
      if (!baixado) {
        resultado = "indisponivel";
        detalhe += " Servidor do TSE não respondeu com um .pub válido para nova comparação.";
      } else if (toHex(baixado) !== hex) {
        resultado = "divergente";
        detalhe = `Arquivo baixado de ${urlUsada} difere byte a byte da chave gravada.`;
      } else {
        detalhe = `Confere com o arquivo oficial baixado de ${urlUsada}.`;
      }
    }

    await supabaseAdmin
      .from("chaves_tse")
      .update({
        ultima_revalidacao: agora,
        resultado_revalidacao: resultado,
        suspeita: resultado === "divergente",
      })
      .eq("id", c.id);

    await supabaseAdmin.from("chaves_revalidacao").insert({
      chave_id: c.id,
      ano_eleicao: c.ano_eleicao,
      sigla_uf: c.sigla_uf,
      fase: c.fase,
      resultado,
      detalhe,
    });

    linhas.push({ chave_id: c.id, ano_eleicao: c.ano_eleicao, sigla_uf: c.sigla_uf, fase: c.fase, resultado, detalhe });
  }

  return {
    ok: true,
    total: linhas.length,
    divergentes: linhas.filter((l) => l.resultado === "divergente").length,
    indisponiveis: linhas.filter((l) => l.resultado === "indisponivel").length,
    linhas,
  };
}
