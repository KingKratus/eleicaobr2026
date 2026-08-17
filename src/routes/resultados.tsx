import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { CARGOS, UFS } from "@/lib/cargos";

export const Route = createFileRoute("/resultados")({
  head: () => ({
    meta: [
      { title: "Resultados · Totalização Paralela 2026" },
      { name: "description", content: "Resultados agregados dos Boletins de Urna validados pela rede paralela, por eleição, cargo, turno, estado e município." },
      { property: "og:title", content: "Resultados · Totalização Paralela 2026" },
      { property: "og:description", content: "Apuração paralela cidadã: totais por cargo, UF e município, com camada de treinamento separada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultadosPage,
});

type MunOpt = { municipio_num: number; municipio_nome: string | null };

function ResultadosPage() {
  const [teste, setTeste] = useState(false);
  const [ano, setAno] = useState(2026);
  const [cargo, setCargo] = useState(1);
  const [turno, setTurno] = useState(1);
  const [uf, setUf] = useState<string>("");
  const [municipio, setMunicipio] = useState<string>("");

  // Anos com dados no modo escolhido
  const { data: anos = [] } = useQuery({
    queryKey: ["anos-disponiveis", teste],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("anos_disponiveis", { _teste: teste });
      return (data ?? []) as { ano: number; bus: number }[];
    },
    staleTime: 60_000,
  });

  // Ao trocar de modo, seleciona um ano que tenha dados
  useEffect(() => {
    setMunicipio("");
    if (!teste) { setAno(2026); return; }
    if (anos.length > 0 && !anos.some((a) => Number(a.ano) === ano)) setAno(Number(anos[0].ano));
  }, [teste, anos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setMunicipio(""); }, [uf, ano]);

  const { data: municipios = [] } = useQuery({
    queryKey: ["mun-opts", ano, teste, uf],
    enabled: !!uf,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("cobertura")
        .select("municipio_num,municipio_nome")
        .eq("ano_eleicao", ano)
        .eq("modo_teste", teste)
        .eq("sigla_uf", uf)
        .order("total_bus_validados", { ascending: false })
        .limit(200);
      return (data ?? []) as MunOpt[];
    },
  });

  const { data } = useQuery({
    queryKey: ["resultados", ano, teste, cargo, turno, uf, municipio],
    queryFn: async () => {
      let q = supabase.from("totais_cargo").select("id,candidato_numero,total_votos,total_bus_computados")
        .eq("ano_eleicao", ano).eq("modo_teste", teste).eq("cargo_codigo", cargo).eq("num_turno", turno)
        .order("total_votos", { ascending: false }).limit(20);
      q = uf ? q.eq("sigla_uf", uf) : q.is("sigla_uf", null);
      q = municipio ? q.eq("municipio_num", Number(municipio)) : q.is("municipio_num", null);
      const { data } = await q;
      return data ?? [];
    },
    staleTime: 20_000,
    refetchInterval: teste ? 15_000 : 60_000,
  });

  const total = (data ?? []).reduce((s, r) => s + Number(r.total_votos), 0);
  const bus = Math.max(0, ...(data ?? []).map((r) => Number(r.total_bus_computados ?? 0)));
  const nomeMun = municipios.find((m) => String(m.municipio_num) === municipio);
  const escopo = municipio ? (nomeMun?.municipio_nome ?? `Município ${municipio}`) : uf || "Brasil";

  return (
    <AppShell testMode={teste}>
      <section className="px-4 py-4 space-y-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTeste(false)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${!teste ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}
          >
            Oficial 2026
          </button>
          <button
            onClick={() => setTeste(true)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${teste ? "border-warning bg-warning/10 text-warning" : "border-border text-muted-foreground"}`}
          >
            Treinamento
          </button>
          {teste && (
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="rounded-sm border border-border bg-background px-2 text-[11px]"
            >
              {(anos.length > 0 ? anos.map((a) => Number(a.ano)) : [2024, 2022, 2020]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-2">
          <select value={cargo} onChange={(e) => setCargo(Number(e.target.value))} className="flex-1 rounded-sm border border-border bg-background p-2 text-xs">
            {Object.entries(CARGOS).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
          </select>
          <select value={turno} onChange={(e) => setTurno(Number(e.target.value))} className="rounded-sm border border-border bg-background p-2 text-xs">
            <option value={1}>1º turno</option>
            <option value={2}>2º turno</option>
          </select>
        </div>

        <div className="flex gap-2">
          <select value={uf} onChange={(e) => setUf(e.target.value)} className="w-28 rounded-sm border border-border bg-background p-2 text-xs">
            <option value="">Nacional</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            disabled={!uf}
            className="flex-1 rounded-sm border border-border bg-background p-2 text-xs disabled:opacity-40"
          >
            <option value="">{uf ? "Todos os municípios" : "Selecione uma UF"}</option>
            {municipios.map((m) => (
              <option key={m.municipio_num} value={m.municipio_num}>
                {m.municipio_nome ?? `Município ${m.municipio_num}`}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="px-4 py-6 animate-reveal">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-mono-label">{CARGOS[cargo]?.nome} · {escopo}</h2>
          <span className="font-mono text-[10px] text-muted-foreground">{ano} · {bus} BU{bus === 1 ? "" : "s"}</span>
        </div>
        {!data || data.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Sem dados validados ainda para este recorte.
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
