import { createFileRoute } from "@tanstack/react-router";

/**
 * Revalidação periódica das chaves públicas Ed25519 do TSE.
 * Recalcula o SHA-512 das chaves gravadas, rebaixa o .pub oficial quando
 * disponível e marca discrepâncias (`suspeita = true`).
 *
 * Agendado por pg_cron uma vez por dia. Quando o segredo CRON_SECRET está
 * configurado, exige o header `x-cron-secret`.
 */
export const Route = createFileRoute("/api/public/hooks/revalidar-chaves")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (secret && request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { revalidarChavesCore } = await import("@/lib/tse-pub.server");
        const started = Date.now();
        const res = await revalidarChavesCore({ baixarDoTse: true });
        return new Response(
          JSON.stringify({ ...res, linhas: res.linhas?.slice(0, 50), duracao_ms: Date.now() - started }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
