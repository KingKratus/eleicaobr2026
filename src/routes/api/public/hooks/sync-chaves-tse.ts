import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina diária: percorre todas as UFs × {LEGAL, COMUNITARIA} × {O, S}
 * para o ano corrente e o próximo, baixa as chaves públicas Ed25519
 * do TSE e armazena versionadas na tabela `chaves_tse`.
 *
 * Endpoint público — chamado pelo pg_cron uma vez por dia.
 * Idempotente: usa UPSERT por (versao_chave, sigla_uf, tipo_eleicao, fase).
 *
 * O TSE publica as chaves do BU em:
 *   http://qrcodenobu.tse.jus.br/tse.qrcodebu/{VRCH}/{LEGAL|COMUNITARIA}/{O|S}{uf}qrcode.pub
 *
 * Como o VRCH só é conhecido próximo do pleito, varremos uma lista de
 * VRCHs candidatos (formatos históricos + padrão YYYY.N e YYYYMMDD).
 */

const UFS = [
  "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz",
];

const TIPOS = ["LEGAL", "COMUNITARIA"] as const;
const FASES = ["O", "S"] as const;

function candidateVrchs(): { vrch: string; ano: number }[] {
  const now = new Date();
  const ano = now.getUTCFullYear();
  const list: { vrch: string; ano: number }[] = [];
  for (const a of [ano, ano + 1]) {
    list.push({ vrch: `${a}.1`, ano: a });
    list.push({ vrch: `${a}.2`, ano: a });
  }
  // VRCHs publicados historicamente para 2024 (mantém ativo o lookup)
  list.push({ vrch: "2024.1", ano: 2024 });
  list.push({ vrch: "2024.2", ano: 2024 });
  return list;
}

function vrchYear(vrch: string): number | null {
  const m = vrch.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

async function tryDownload(vrch: string, tipo: string, fase: string, uf: string) {
  const url = `http://qrcodenobu.tse.jus.br/tse.qrcodebu/${vrch}/${tipo}/${fase}${uf}qrcode.pub`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "TotalizacaoParalela2026/1.0 (+sync)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false as const, url };
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length !== 32) return { ok: false as const, url };
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    return { ok: true as const, url, hex };
  } catch {
    return { ok: false as const, url };
  }
}

export const Route = createFileRoute("/api/public/hooks/sync-chaves-tse")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const started = Date.now();
        let okCount = 0;
        let skipped = 0;
        const errors: string[] = [];
        const vrchs = candidateVrchs();

        // limita concorrência para não saturar o backend do TSE
        const tasks: Promise<void>[] = [];
        const queue: { vrch: string; ano: number; tipo: string; fase: string; uf: string }[] = [];
        for (const { vrch, ano } of vrchs) {
          for (const tipo of TIPOS) for (const fase of FASES) for (const uf of UFS) {
            queue.push({ vrch, ano, tipo, fase, uf });
          }
        }

        const CONCURRENCY = 12;
        let cursor = 0;
        async function worker() {
          while (cursor < queue.length) {
            const item = queue[cursor++];
            const res = await tryDownload(item.vrch, item.tipo, item.fase, item.uf);
            if (!res.ok) { skipped++; continue; }
            const { error } = await supabaseAdmin.from("chaves_tse").upsert({
              versao_chave: item.vrch,
              sigla_uf: item.uf.toUpperCase(),
              tipo_eleicao: item.tipo,
              fase: item.fase,
              ano_eleicao: item.ano,
              chave_publica_hex: res.hex,
              ativo: true,
              abrangencia: item.uf === "zz" ? "BR" : "UF",
              url_origem: res.url,
              ultima_sincronizacao: new Date().toISOString(),
              valido_de: `${item.ano}-01-01`,
              valido_ate: `${item.ano}-12-31`,
            }, { onConflict: "versao_chave,sigla_uf,tipo_eleicao,fase" });
            if (error) errors.push(`${item.vrch}/${item.uf}: ${error.message}`);
            else okCount++;
          }
        }
        for (let i = 0; i < CONCURRENCY; i++) tasks.push(worker());
        await Promise.all(tasks);

        return new Response(JSON.stringify({
          ok: true,
          baixadas: okCount,
          ignoradas: skipped,
          erros: errors.slice(0, 10),
          duracao_ms: Date.now() - started,
          vrchs_tentados: vrchs.map((v) => v.vrch),
        }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
