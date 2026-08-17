import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HEX32 = /^[0-9a-f]{64}$/i;

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
 * Recebe o conteúdo de um arquivo .pub (32 bytes em hex), calcula o SHA-512,
 * compara com o hash oficial cadastrado e enfileira para APROVAÇÃO MANUAL.
 * Nada é ativado aqui.
 */
export const uploadChavePub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UploadInput.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };
    const { sha512Hex, toBytes } = await import("./tse-pub.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hex = data.conteudo_hex.toLowerCase();
    const sha = sha512Hex(toBytes(hex));
    const uf = data.sigla_uf.toUpperCase();

    const { data: row } = await supabaseAdmin
      .from("chaves_tse")
      .select("id, hash_sha512_pub")
      .eq("ano_eleicao", data.ano_eleicao)
      .eq("sigla_uf", uf)
      .eq("fase", data.fase)
      .eq("tipo_eleicao", data.tipo_eleicao)
      .maybeSingle();

    const esperado = row?.hash_sha512_pub?.toLowerCase() ?? null;
    const confere = Boolean(esperado && esperado === sha);

    if (esperado && !confere) {
      return {
        sucesso: false,
        codigo: "HASH_DIVERGENTE",
        erro: "SHA-512 do arquivo não confere com o hash oficial cadastrado. Nada foi enfileirado.",
        sha512_calculado: sha,
        sha512_esperado: esperado,
      };
    }
    if (!esperado && !data.forcar) {
      return {
        sucesso: false,
        codigo: "SEM_HASH_REFERENCIA",
        erro: "Não há hash SHA-512 oficial cadastrado para conferência. Reenvie marcando \"forçar\" para enfileirar mesmo assim.",
        sha512_calculado: sha,
      };
    }

    const { error } = await supabaseAdmin.from("chaves_pub_pendentes").insert({
      ano_eleicao: data.ano_eleicao,
      sigla_uf: uf,
      fase: data.fase,
      tipo_eleicao: data.tipo_eleicao,
      conteudo_hex: hex,
      sha512_calculado: sha,
      sha512_esperado: esperado,
      confere,
      origem: "upload",
      arquivo_nome: data.arquivo_nome,
      enviado_por: context.userId,
      status: "pendente",
    });
    if (error) return { sucesso: false, codigo: "ERRO_DB", erro: error.message, sha512_calculado: sha };

    return { sucesso: true, enfileirado: true, conferido: confere, sha512_calculado: sha };
  });

const BuscaInput = z.object({
  ano_eleicao: z.number().int().min(2000).max(2099),
  sigla_uf: z.string().length(2),
  fase: z.enum(["O", "S", "T"]),
  tipo_eleicao: z.enum(["LEGAL", "COMUNITARIA"]).default("LEGAL"),
  versoes_extra: z.array(z.string().min(3).max(20)).optional().default([]),
});

/**
 * Tenta baixar o .pub oficial do TSE, confere o SHA-512 contra o hash
 * cadastrado e enfileira para aprovação manual (não ativa nada).
 */
export const buscarChavePubOficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BuscaInput.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };
    const { sha512Hex, toHex, baixarPub, urlPub, VERSOES_CONHECIDAS } = await import("./tse-pub.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const uf = data.sigla_uf.toUpperCase();
    const versoes = [...(VERSOES_CONHECIDAS[data.ano_eleicao] ?? []), ...data.versoes_extra];
    const tentativas: { url: string; resultado: string }[] = [];

    const { data: row } = await supabaseAdmin
      .from("chaves_tse")
      .select("id, hash_sha512_pub")
      .eq("ano_eleicao", data.ano_eleicao)
      .eq("sigla_uf", uf)
      .eq("fase", data.fase)
      .eq("tipo_eleicao", data.tipo_eleicao)
      .maybeSingle();
    const esperado = row?.hash_sha512_pub?.toLowerCase() ?? null;

    for (const versao of versoes) {
      const url = urlPub(versao, data.tipo_eleicao, data.fase, uf);
      const bytes = await baixarPub(url);
      if (!bytes) { tentativas.push({ url, resultado: "indisponível ou tamanho inválido" }); continue; }

      const hex = toHex(bytes);
      const sha = sha512Hex(bytes);
      if (esperado && esperado !== sha) {
        tentativas.push({ url, resultado: "SHA-512 divergente do hash oficial" });
        continue;
      }

      const { error } = await supabaseAdmin.from("chaves_pub_pendentes").insert({
        ano_eleicao: data.ano_eleicao,
        sigla_uf: uf,
        fase: data.fase,
        tipo_eleicao: data.tipo_eleicao,
        conteudo_hex: hex,
        sha512_calculado: sha,
        sha512_esperado: esperado,
        confere: Boolean(esperado && esperado === sha),
        origem: "tse",
        url_origem: url,
        arquivo_nome: `${data.fase.toLowerCase()}${uf.toLowerCase()}qrcode.pub`,
        enviado_por: context.userId,
        status: "pendente",
      });
      if (error) { tentativas.push({ url, resultado: `erro DB: ${error.message}` }); continue; }

      tentativas.push({ url, resultado: "OK — enfileirada para aprovação" });
      return { sucesso: true, enfileirado: true, url, sha512: sha, conferido: Boolean(esperado), tentativas };
    }

    return {
      sucesso: false,
      codigo: "INDISPONIVEL",
      erro: "Nenhuma URL oficial respondeu com um .pub válido (o servidor do TSE só fica online no período eleitoral).",
      tentativas,
    };
  });

/** Fila de aprovação. */
export const listarChavesPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: z.enum(["pendente", "aprovada", "rejeitada"]).default("pendente") }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, itens: [] as any[], erro: "Acesso restrito." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: itens, error } = await supabaseAdmin
      .from("chaves_pub_pendentes")
      .select("id, ano_eleicao, sigla_uf, fase, tipo_eleicao, sha512_calculado, sha512_esperado, confere, origem, url_origem, arquivo_nome, status, motivo, created_at")
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return { sucesso: false, itens: [], erro: error.message };
    return { sucesso: true, itens: itens ?? [] };
  });

/** Aprova um item da fila e só então grava/ativa a chave em chaves_tse. */
export const aprovarChavePendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item } = await supabaseAdmin
      .from("chaves_pub_pendentes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!item) return { sucesso: false, erro: "Item não encontrado." };
    if (item.status !== "pendente") return { sucesso: false, erro: `Item já ${item.status}.` };
    if (item.sha512_esperado && !item.confere) {
      return { sucesso: false, codigo: "HASH_DIVERGENTE", erro: "Aprovação bloqueada: SHA-512 diverge do hash oficial." };
    }

    const { data: row } = await supabaseAdmin
      .from("chaves_tse")
      .select("id, versao_chave, hash_sha512_pub")
      .eq("ano_eleicao", item.ano_eleicao)
      .eq("sigla_uf", item.sigla_uf)
      .eq("fase", item.fase)
      .eq("tipo_eleicao", item.tipo_eleicao)
      .maybeSingle();

    const payload = {
      versao_chave: row?.versao_chave ?? `${item.ano_eleicao}.1`,
      sigla_uf: item.sigla_uf,
      tipo_eleicao: item.tipo_eleicao,
      fase: item.fase,
      ano_eleicao: item.ano_eleicao,
      chave_publica_hex: item.conteudo_hex,
      hash_sha512_pub: row?.hash_sha512_pub ?? item.sha512_calculado,
      arquivo_nome: item.arquivo_nome,
      url_origem: item.url_origem,
      abrangencia: item.sigla_uf === "ZZ" ? "BR" : "UF",
      ativo: true,
      suspeita: false,
      resultado_revalidacao: "ok",
      ultima_revalidacao: new Date().toISOString(),
      ultima_sincronizacao: new Date().toISOString(),
    };

    const { error } = row
      ? await supabaseAdmin.from("chaves_tse").update(payload).eq("id", row.id)
      : await supabaseAdmin.from("chaves_tse").upsert(payload, { onConflict: "versao_chave,sigla_uf,tipo_eleicao,fase" });
    if (error) return { sucesso: false, codigo: "ERRO_DB", erro: error.message };

    await supabaseAdmin
      .from("chaves_pub_pendentes")
      .update({ status: "aprovada", revisado_por: context.userId, revisado_em: new Date().toISOString() })
      .eq("id", item.id);

    return { sucesso: true, versao_chave: payload.versao_chave };
  });

export const rejeitarChavePendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), motivo: z.string().max(300).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { sucesso: false, erro: "Acesso restrito." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("chaves_pub_pendentes")
      .update({
        status: "rejeitada",
        motivo: data.motivo ?? null,
        revisado_por: context.userId,
        revisado_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pendente");
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  });

/** Disparo manual da revalidação periódica. */
export const revalidarChaves = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ baixar_do_tse: z.boolean().default(true) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await assertMod(context))) return { ok: false, erro: "Acesso restrito." };
    const { revalidarChavesCore } = await import("./tse-pub.server");
    return await revalidarChavesCore({ baixarDoTse: data.baixar_do_tse });
  });
