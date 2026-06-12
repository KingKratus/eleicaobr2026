import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  versao_chave: z.string().min(4).max(16),
  sigla_uf: z.string().length(2),
  tipo_eleicao: z.enum(["LEGAL", "COMUNITARIA"]),
  fase: z.enum(["O", "S", "T"]),
  ano_eleicao: z.number().int().default(2026),
});

/**
 * Faz download de chave pública oficial do TSE conforme §6.2 do manual:
 *   {URL_BASE}/{VERSAO_CHAVE}/{LEGAL|COMUNITARIA}/{O|S}{uf}qrcode.pub
 * Arquivo binário de 32 bytes (Ed25519). Converte para hex e salva.
 */
export const importarChaveTSE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    // Apenas admin/moderador
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: ok2 } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "moderador" });
    if (!ok && !ok2) return { sucesso: false, erro: "Acesso restrito." };

    const fase = data.fase === "T" ? "S" : data.fase; // TSE só publica O/S
    const url = `http://qrcodenobu.tse.jus.br/tse.qrcodebu/${data.versao_chave}/${data.tipo_eleicao}/${fase}${data.sigla_uf.toLowerCase()}qrcode.pub`;

    let bytes: Uint8Array;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "TotalizacaoParalela2026/1.0" } });
      if (!r.ok) return { sucesso: false, erro: `TSE respondeu ${r.status}. URL: ${url}` };
      bytes = new Uint8Array(await r.arrayBuffer());
    } catch (e: any) {
      return { sucesso: false, erro: `Falha ao baixar chave: ${e.message}. URL: ${url}` };
    }

    if (bytes.length !== 32) {
      return { sucesso: false, erro: `Chave inválida: esperava 32 bytes, recebeu ${bytes.length}.` };
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("chaves_tse").upsert({
      versao_chave: data.versao_chave,
      sigla_uf: data.sigla_uf.toUpperCase(),
      tipo_eleicao: data.tipo_eleicao,
      fase: data.fase,
      ano_eleicao: data.ano_eleicao,
      chave_publica_hex: hex,
      ativo: true,
    }, { onConflict: "versao_chave,sigla_uf,tipo_eleicao,fase" });

    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true, url, chave_publica_hex: hex };
  });
