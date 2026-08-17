import { createFileRoute } from "@tanstack/react-router";

/** Endpoint público: cobertura de seções validadas por UF/município. */
export const Route = createFileRoute("/api/public/v1/cobertura")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ano = parseInt(url.searchParams.get("ano") ?? "2026", 10);
        const uf = url.searchParams.get("uf");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("cobertura")
          .select("sigla_uf,municipio_num,municipio_nome,total_bus_validados,percentual")
          .eq("ano_eleicao", ano)
          .eq("modo_teste", url.searchParams.get("teste") === "1");
        if (uf) q = q.eq("sigla_uf", uf.toUpperCase());
        const { data, error } = await q.order("total_bus_validados", { ascending: false }).limit(1000);
        if (error) {
          return new Response(JSON.stringify({ ok: false, erro: error.message }), {
            status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }
        return new Response(JSON.stringify({ ok: true, ano, uf, cobertura: data }), {
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        });
      },
    },
  },
});
