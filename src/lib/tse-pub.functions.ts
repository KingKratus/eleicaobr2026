import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sha512 } from "@noble/hashes/sha2.js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HEX32 = /^[0-9a-f]{64}$/i;

function toBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function assertMod(context: any) {
  const { data: a } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  const { data: m } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "moderador" });
  return Boolean(a || m);
}

const UploadInput = z.object({
  arquivo_nome: z.string().min(3).max(80),
  conteudo_hex: z.string().regex(HEX32, "Arquivo .pub deve ter exatamente 32 bytes (64 hex)."),
  ano_eleicao: z.number().int().min(2000).max(2099),
  sigla_uf: z.string().length(2),
  fase: z.enum(["O", "S", "T"]),
  tipo_eleicao: z.enum(["LEGAL", "COMUNITARIA"]).default("LEGAL"),
  forcar: z.boolean().optional().default(false),
});

/**
 * Recebe o conteúdo de um arquivo .pub (32 bytes em hex), calcula o SHA-512
 * e compara com o hash oficial já cadastrado antes de ativar a chave.
 */
export const uploadChavePub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UploadInput.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };

    const hex = data.conteudo_hex.toLowerCase();
    const sha = toHex(sha512(toBytes(hex)));
    const uf = data.sigla_uf.toUpperCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("chaves_tse")
      .select("id, hash_sha512_pub, versao_chave")
      .eq("ano_eleicao", data.ano_eleicao)
      .eq("sigla_uf", uf)
      .eq("fase", data.fase)
      .eq("tipo_eleicao", data.tipo_eleicao)
      .maybeSingle();

    if (row?.hash_sha512_pub && row.hash_sha512_pub.toLowerCase() !== sha) {
      return {
        sucesso: false,
        codigo: "HASH_DIVERGENTE",
        erro: "SHA-512 do arquivo não confere com o hash oficial cadastrado. Chave NÃO ativada.",
        sha512_calculado: sha,
        sha512_esperado: row.hash_sha512_pub,
      };
    }
    if (!row?.hash_sha512_pub && !data.forcar) {
      return {
        sucesso: false,
        codigo: "SEM_HASH_REFERENCIA",
        erro: "Não há hash SHA-512 oficial cadastrado para conferência. Reenvie marcando \"forçar\" para gravar mesmo assim.",
        sha512_calculado: sha,
      };
    }

    const payload = {
      versao_chave: row?.versao_chave ?? `${data.ano_eleicao}.1`,
      sigla_uf: uf,
      tipo_eleicao: data.tipo_eleicao,
      fase: data.fase,
      ano_eleicao: data.ano_eleicao,
      chave_publica_hex: hex,
      hash_sha512_pub: row?.hash_sha512_pub ?? sha,
      arquivo_nome: data.arquivo_nome,
      abrangencia: uf === "ZZ" ? "BR" : "UF",
      ativo: true,
      ultima_sincronizacao: new Date().toISOString(),
    };

    const { error } = row
      ? await supabaseAdmin.from("chaves_tse").update(payload).eq("id", row.id)
      : await supabaseAdmin.from("chaves_tse").upsert(payload, { onConflict: "versao_chave,sigla_uf,tipo_eleicao,fase" });

    if (error) return { sucesso: false, codigo: "ERRO_DB", erro: error.message, sha512_calculado: sha };
    return {
      sucesso: true,
      sha512_calculado: sha,
      conferido: Boolean(row?.hash_sha512_pub),
      versao_chave: payload.versao_chave,
    };
  });

const BuscaInput = z.object({
  ano_eleicao: z.number().int().min(2000).max(2099),
  sigla_uf: z.string().length(2),
  fase: z.enum(["O", "S", "T"]),
  tipo_eleicao: z.enum(["LEGAL", "COMUNITARIA"]).default("LEGAL"),
  versoes_extra: z.array(z.string().min(3).max(20)).optional().default([]),
});

const VERSOES_CONHECIDAS: Record<number, string[]> = {
  2020: ["20201028", "2020.1"],
  2022: ["20220829", "20220920", "2022.1"],
  2024: ["20240507", "20240902", "2024.1"],
  2026: ["2026.1", "20260901"],
};

/**
 * Tenta baixar o .pub oficial do TSE em várias combinações de VERSAO/prefixo,
 * confere o SHA-512 contra o hash cadastrado e só então ativa a chave.
 */
export const buscarChavePubOficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BuscaInput.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };

    const uf = data.sigla_uf.toUpperCase();
    const prefixo = data.fase.toLowerCase(); // o | s | t
    const versoes = [...(VERSOES_CONHECIDAS[data.ano_eleicao] ?? []), ...data.versoes_extra];
    const tentativas: { url: string; resultado: string }[] = [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("chaves_tse")
      .select("id, hash_sha512_pub, versao_chave")
      .eq("ano_eleicao", data.ano_eleicao)
      .eq("sigla_uf", uf)
      .eq("fase", data.fase)
      .eq("tipo_eleicao", data.tipo_eleicao)
      .maybeSingle();

    for (const versao of versoes) {
      const url = `http://qrcodenobu.tse.jus.br/tse.qrcodebu/${versao}/${data.tipo_eleicao}/${prefixo}${uf.toLowerCase()}qrcode.pub`;
      let bytes: Uint8Array | null = null;
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "TotalizacaoParalela2026/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) { tentativas.push({ url, resultado: `HTTP ${r.status}` }); continue; }
        bytes = new Uint8Array(await r.arrayBuffer());
      } catch (e: any) {
        tentativas.push({ url, resultado: `falha de rede: ${e.message}` });
        continue;
      }
      if (bytes.length !== 32) { tentativas.push({ url, resultado: `${bytes.length} bytes (esperado 32)` }); continue; }

      const hex = toHex(bytes);
      const sha = toHex(sha512(bytes));
      if (row?.hash_sha512_pub && row.hash_sha512_pub.toLowerCase() !== sha) {
        tentativas.push({ url, resultado: "SHA-512 divergente do hash oficial" });
        continue;
      }

      const payload = {
        versao_chave: row?.versao_chave ?? versao,
        sigla_uf: uf,
        tipo_eleicao: data.tipo_eleicao,
        fase: data.fase,
        ano_eleicao: data.ano_eleicao,
        chave_publica_hex: hex,
        hash_sha512_pub: row?.hash_sha512_pub ?? sha,
        arquivo_nome: `${prefixo}${uf.toLowerCase()}qrcode.pub`,
        abrangencia: uf === "ZZ" ? "BR" : "UF",
        url_origem: url,
        ativo: true,
        ultima_sincronizacao: new Date().toISOString(),
      };
      const { error } = row
        ? await supabaseAdmin.from("chaves_tse").update(payload).eq("id", row.id)
        : await supabaseAdmin.from("chaves_tse").upsert(payload, { onConflict: "versao_chave,sigla_uf,tipo_eleicao,fase" });
      if (error) { tentativas.push({ url, resultado: `erro DB: ${error.message}` }); continue; }

      tentativas.push({ url, resultado: "OK" });
      return { sucesso: true, url, sha512: sha, conferido: Boolean(row?.hash_sha512_pub), tentativas };
    }

    return {
      sucesso: false,
      codigo: "INDISPONIVEL",
      erro: "Nenhuma URL oficial respondeu com um .pub válido (o servidor do TSE só fica online no período eleitoral).",
      tentativas,
    };
  });
