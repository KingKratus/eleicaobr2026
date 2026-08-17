import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint público read-only: totais agregados por cargo/UF.
 * Query params:
 *   ano (default: 2026), turno (1|2, default: 1), uf (opcional), cargo (opcional)
 */
export const Route = createFileRoute("/api/public/v1/totais")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ano = parseInt(url.searchParams.get("ano") ?? "2026", 10);
        const turno = parseInt(url.searchParams.get("turno") ?? "1", 10);
        const uf = url.searchParams.get("uf");
        const cargo = url.searchParams.get("cargo");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("totais_cargo")
          .select("sigla_uf,cargo_codigo,candidato_numero,total_votos,total_bus_computados")
          .eq("ano_eleicao", ano)
          .eq("modo_teste", url.searchParams.get("teste") === "1")
          .eq("num_turno", turno);
        if (uf) q = q.eq("sigla_uf", uf.toUpperCase());
        else q = q.is("sigla_uf", null);
        if (cargo) q = q.eq("cargo_codigo", parseInt(cargo, 10));

        const { data, error } = await q.order("total_votos", { ascending: false }).limit(500);
        if (error) {
          return new Response(JSON.stringify({ ok: false, erro: error.message }), {
            status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }
        return new Response(JSON.stringify({ ok: true, ano, turno, uf, cargo, totais: data }), {
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        });
      },
    },
  },
});
