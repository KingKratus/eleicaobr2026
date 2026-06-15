import { createFileRoute } from "@tanstack/react-router";

/** Endpoint público: metadados + hash de um BU específico (sem PII). */
export const Route = createFileRoute("/api/public/v1/boletins/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("boletins")
          .select("id,ano_eleicao,fase,sigla_uf,municipio_num,municipio_nome,zona,secao,num_turno,id_carga,hash_final,versao_chave,assinatura_valida,status,modo_teste,created_at")
          .eq("id", params.id)
          .eq("status", "validado")
          .maybeSingle();
        if (error) {
          return new Response(JSON.stringify({ ok: false, erro: error.message }), {
            status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }
        if (!data) {
          return new Response(JSON.stringify({ ok: false, erro: "BU não encontrado." }), {
            status: 404, headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
          });
        }
        return new Response(JSON.stringify({ ok: true, boletim: data }), {
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        });
      },
    },
  },
});
