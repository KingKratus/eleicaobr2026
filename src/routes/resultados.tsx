import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { CARGOS, UFS } from "@/lib/cargos";

export const Route = createFileRoute("/resultados")({
  head: () => ({ meta: [{ title: "Resultados · Totalização Paralela 2026" }] }),
  component: ResultadosPage,
});

function ResultadosPage() {
  const [cargo, setCargo] = useState(1);
  const [turno, setTurno] = useState(1);
  const [uf, setUf] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["resultados", cargo, turno, uf],
    queryFn: async () => {
      let q = supabase.from("totais_cargo").select("id,candidato_numero,total_votos")
        .eq("ano_eleicao", 2026).eq("modo_teste", false).eq("cargo_codigo", cargo).eq("num_turno", turno)
        .order("total_votos", { ascending: false }).limit(20);
      q = uf ? q.eq("sigla_uf", uf) : q.is("sigla_uf", null);
      const { data } = await q;
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const total = (data ?? []).reduce((s, r) => s + Number(r.total_votos), 0);

  return (
    <AppShell>
      <section className="px-4 py-4 space-y-3">
        <div className="flex gap-2">
          <select value={cargo} onChange={(e) => setCargo(Number(e.target.value))} className="flex-1 rounded-sm border border-border bg-background p-2 text-xs">
            {Object.entries(CARGOS).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
          </select>
          <select value={turno} onChange={(e) => setTurno(Number(e.target.value))} className="rounded-sm border border-border bg-background p-2 text-xs">
            <option value={1}>1º turno</option>
            <option value={2}>2º turno</option>
          </select>
        </div>
        <select value={uf} onChange={(e) => setUf(e.target.value)} className="w-full rounded-sm border border-border bg-background p-2 text-xs">
          <option value="">Nacional</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </section>

      <section className="px-4 py-6 animate-reveal">
        <h2 className="text-mono-label mb-4">{CARGOS[cargo]?.nome} · {uf || "Brasil"}</h2>
        {!data || data.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Sem dados validados ainda.
          </p>
        ) : (
          <div className="space-y-5">
            {data.map((r, i) => {
              const pct = total > 0 ? (Number(r.total_votos) / total) * 100 : 0;
              return (
                <div key={r.id}>
                  <div className="mb-1 flex items-end justify-between">
                    <div>
                      <span className="block font-mono text-[10px] font-bold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-sm font-bold uppercase tracking-tight">Candidato Nº {r.candidato_numero}</span>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono text-sm font-bold">{pct.toFixed(2)}%</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{Number(r.total_votos).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
