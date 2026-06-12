import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createNvidiaProvider } from "./nvidia-gateway.server";
import { CARGOS } from "./cargos";

const Input = z.object({ bu_id: z.string().uuid() });

const MODEL = "meta/llama-3.3-70b-instruct";

/**
 * Auditor IA: usa NVIDIA Build com tool-calling para analisar um BU
 * e seus agregados, sinalizando anomalias.
 */
export const auditarBU = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isMod } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "moderador" });
    if (!isAdmin && !isMod) return { erro: "Acesso restrito a moderadores/admins." };

    const key = process.env.NVIDIA_API_KEY;
    if (!key) return { erro: "NVIDIA_API_KEY não configurada." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bu, error } = await supabaseAdmin.from("boletins").select("*").eq("id", data.bu_id).maybeSingle();
    if (error || !bu) return { erro: "BU não encontrado." };

    const tools = {
      getTotaisSecao: tool({
        description: "Retorna totais agregados por cargo para uma seção (UF/zona/seção).",
        inputSchema: z.object({ uf: z.string().length(2), zona: z.number(), secao: z.number() }),
        execute: async ({ uf, zona, secao }) => {
          const { data } = await supabaseAdmin.from("boletins")
            .select("votos,num_turno")
            .eq("sigla_uf", uf).eq("zona", zona).eq("secao", secao).eq("status", "validado");
          return data ?? [];
        },
      }),
      getCargo: tool({
        description: "Devolve nome e tipo do cargo a partir do código TSE.",
        inputSchema: z.object({ codigo: z.number() }),
        execute: async ({ codigo }) => CARGOS[codigo] ?? { erro: "cargo desconhecido" },
      }),
      getCoberturaUF: tool({
        description: "Quantos BUs já validados por UF.",
        inputSchema: z.object({ uf: z.string().length(2) }),
        execute: async ({ uf }) => {
          const { count } = await supabaseAdmin.from("boletins").select("id", { count: "exact", head: true })
            .eq("sigla_uf", uf).eq("status", "validado").eq("modo_teste", false);
          return { uf, total: count ?? 0 };
        },
      }),
    };

    const nvidia = createNvidiaProvider(key);
    try {
      const res = await generateText({
        model: nvidia(MODEL),
        system: `Você é um auditor eleitoral cidadão. Analise o BU fornecido em JSON e use as ferramentas para comparar com agregados.
Aponte: (1) coerência interna (NOMI + BRAN + NULO = TOTC), (2) votos negativos ou improváveis, (3) candidatos com numeração fora do padrão para o cargo, (4) divergência com seções vizinhas.
Responda em português, conciso (máx 250 palavras), em markdown com seções: Resumo, Apontamentos, Recomendação.`,
        prompt: `BU id=${bu.id}\nUF=${bu.sigla_uf} zona=${bu.zona} seção=${bu.secao} turno=${bu.num_turno} ano=${bu.ano_eleicao}\n\nVotos:\n${JSON.stringify(bu.votos, null, 2)}\n\nEleitores aptos=${bu.eleitores_aptos} comparecimento=${bu.comparecimento}`,
        tools,
        stopWhen: stepCountIs(50),
      });
      return { sucesso: true, texto: res.text, steps: res.steps?.length ?? 1 };
    } catch (e: any) {
      return { erro: `IA falhou: ${e.message}` };
    }
  });
