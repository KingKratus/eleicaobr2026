import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { CARGOS, UFS } from "@/lib/cargos";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights da Apuração · Totalização Paralela 2026" },
      { name: "description", content: "Gráficos da apuração paralela: evolução dos boletins validados no tempo, cobertura por região, participação eleitoral e distribuição de votos por cargo." },
      { property: "og:title", content: "Insights da Apuração · Totalização Paralela 2026" },
      { property: "og:description", content: "Evolução dos votos, cobertura por região e município e participação eleitoral na apuração paralela cidadã." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

const CORES = ["oklch(0.71 0.16 50)", "oklch(0.62 0.14 250)", "oklch(0.66 0.15 150)", "oklch(0.60 0.16 20)", "oklch(0.70 0.10 300)", "oklch(0.55 0.05 260)"];

function InsightsPage() {
  const [teste, setTeste] = useState(false);
  const [ano, setAno] = useState(2026);
  const [turno, setTurno] = useState(1);
  const [cargo, setCargo] = useState(1);
  const [uf, setUf] = useState("");

  const { data: anos = [] } = useQuery({
    queryKey: ["anos-disponiveis", teste],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("anos_disponiveis", { _teste: teste });
      return (data ?? []) as { ano: number; bus: number }[];
    },
  });

  const anosOpcoes = Array.from(new Set([...anos.map((a) => Number(a.ano)), 2026])).sort((a, b) => b - a);
  const anoAtivo = anosOpcoes.includes(ano) ? ano : (anosOpcoes[0] ?? 2026);

  const { data: timeline = [] } = useQuery({
    queryKey: ["insights-timeline", anoAtivo, turno, teste],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("insights_timeline", { _ano: anoAtivo, _turno: turno, _teste: teste });
      return (data ?? []) as { bucket: string; bus: number }[];
    },
  });

  const { data: regioes = [] } = useQuery({
    queryKey: ["insights-regiao", anoAtivo, turno, teste],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("insights_regiao", { _ano: anoAtivo, _turno: turno, _teste: teste });
      return (data ?? []) as { regiao: string; bus: number; ufs: number; municipios: number }[];
    },
  });

  const { data: part } = useQuery({
    queryKey: ["insights-part", anoAtivo, turno, teste, uf],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("insights_participacao", {
        _ano: anoAtivo, _turno: turno, _teste: teste, _uf: uf || null,
      });
      return ((data ?? [])[0] ?? null) as { aptos: number; comparecimento: number; faltosos: number; bus: number } | null;
    },
  });

  const { data: votos = [] } = useQuery({
    queryKey: ["insights-votos", anoAtivo, turno, teste, cargo, uf],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("totais_cargo").select("id,candidato_numero,total_votos")
        .eq("ano_eleicao", anoAtivo).eq("modo_teste", teste).eq("cargo_codigo", cargo)
        .eq("num_turno", turno).order("total_votos", { ascending: false }).limit(8);
      q = uf ? q.eq("sigla_uf", uf) : q.is("sigla_uf", null);
      const { data } = await q.is("municipio_num", null);
      return data ?? [];
    },
  });

  let acumulado = 0;
  const serie = timeline.map((t) => {
    acumulado += Number(t.bus);
    return {
      hora: new Date(t.bucket).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" }),
      bus: Number(t.bus),
      acumulado,
    };
  });

  const totalVotos = votos.reduce((s, r) => s + Number(r.total_votos), 0);
  const pizza = votos.map((r) => ({ nome: `Nº ${r.candidato_numero}`, valor: Number(r.total_votos) }));
  const pctComp = part && part.aptos > 0 ? (part.comparecimento / part.aptos) * 100 : 0;

  return (
    <AppShell testMode={teste} title="Insights" subtitle="Análise da apuração">
      <section className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTeste(false)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${!teste ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}
          >Oficial 2026</button>
          <button
            onClick={() => setTeste(true)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${teste ? "border-warning bg-warning/10 text-warning" : "border-border text-muted-foreground"}`}
          >Treinamento</button>
        </div>

        <div className="flex gap-2">
          <select value={anoAtivo} onChange={(e) => setAno(Number(e.target.value))} className="flex-1 rounded-sm border border-border bg-background p-2 text-xs">
            {anosOpcoes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={turno} onChange={(e) => setTurno(Number(e.target.value))} className="rounded-sm border border-border bg-background p-2 text-xs">
            <option value={1}>1º turno</option>
            <option value={2}>2º turno</option>
          </select>
          <select value={uf} onChange={(e) => setUf(e.target.value)} className="w-24 rounded-sm border border-border bg-background p-2 text-xs">
            <option value="">Brasil</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 px-4 py-4 text-center">
        <Metric label="Aptos" value={part?.aptos ?? 0} />
        <Metric label="Comparecimento" value={part?.comparecimento ?? 0} />
        <Metric label="BUs" value={part?.bus ?? 0} />
      </section>

      <section className="px-4 pb-4">
        <div className="rounded-sm border border-border bg-card p-3">
          <p className="text-[9px] uppercase text-muted-foreground">Participação</p>
          <p className="font-mono text-2xl font-bold">{pctComp.toFixed(2)}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${Math.min(100, pctComp)}%` }} />
          </div>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground">
            {(part?.faltosos ?? 0).toLocaleString("pt-BR")} faltosos nos BUs computados
          </p>
        </div>
      </section>

      <Bloco titulo="Evolução dos boletins validados">
        {serie.length === 0 ? <Vazio /> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
              <XAxis dataKey="hora" tick={{ fontSize: 9 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke={CORES[0]} fill={CORES[0]} fillOpacity={0.2} />
              <Area type="monotone" dataKey="bus" name="Por hora" stroke={CORES[1]} fill={CORES[1]} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Bloco>

      <Bloco titulo="Cobertura por região">
        {regioes.length === 0 ? <Vazio /> : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={regioes.map((r) => ({ ...r, bus: Number(r.bus) }))} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis dataKey="regiao" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="bus" name="BUs" radius={[2, 2, 0, 0]}>
                  {regioes.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ul className="mt-2 divide-y divide-border rounded-sm border border-border">
              {regioes.map((r) => (
                <li key={r.regiao} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="font-bold uppercase tracking-tight">{r.regiao}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.ufs} UF · {r.municipios} mun. · {Number(r.bus).toLocaleString("pt-BR")} BUs
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloco>

      <Bloco
        titulo="Distribuição de votos"
        acao={
          <select value={cargo} onChange={(e) => setCargo(Number(e.target.value))} className="rounded-sm border border-border bg-background p-1 text-[10px]">
            {Object.entries(CARGOS).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
          </select>
        }
      >
        {pizza.length === 0 ? <Vazio /> : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pizza} dataKey="valor" nameKey="nome" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {pizza.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center font-mono text-[10px] text-muted-foreground">
              {totalVotos.toLocaleString("pt-BR")} votos computados · {CARGOS[cargo]?.nome} · {uf || "Brasil"}
            </p>
          </>
        )}
      </Bloco>
    </AppShell>
  );
}

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-mono-label">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Vazio() {
  return (
    <p className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
      Sem dados para este recorte ainda.
    </p>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-card px-2 py-2">
      <p className="font-mono text-base font-bold">{Number(value).toLocaleString("pt-BR")}</p>
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
