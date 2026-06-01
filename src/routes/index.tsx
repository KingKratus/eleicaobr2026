import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CARGOS } from "@/lib/cargos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel · Totalização Paralela 2026" },
      { name: "description", content: "Painel ao vivo da totalização paralela cidadã das Eleições Gerais 2026." },
    ],
  }),
  component: PainelPage,
});

function PainelPage() {
  const { user } = useAuth();

  const { data: totais } = useQuery({
    queryKey: ["totais-nacional", 2026, 1],
    queryFn: async () => {
      const { data } = await supabase
        .from("totais_cargo")
        .select("*")
        .eq("ano_eleicao", 2026)
        .eq("cargo_codigo", 1)
        .eq("num_turno", 1)
        .is("sigla_uf", null)
        .order("total_votos", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["stats-globais"],
    queryFn: async () => {
      const [{ count: bus }, { count: cob }, { count: vol }] = await Promise.all([
        supabase.from("boletins").select("id", { count: "exact", head: true }).eq("status", "validado").eq("modo_teste", false),
        supabase.from("cobertura").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return { bus: bus ?? 0, cob: cob ?? 0, vol: vol ?? 0 };
    },
    refetchInterval: 15000,
  });

  return (
    <AppShell>
      <section className="animate-reveal px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-mono-label">Status Global</h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {new Date().toLocaleTimeString("pt-BR")} BRT
          </span>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border">
          <Stat label="BUs Validados" value={formatNum(stats?.bus ?? 0)} />
          <Stat label="Municípios" value={formatNum(stats?.cob ?? 0)} accent />
          <Stat label="Voluntários" value={formatNum(stats?.vol ?? 0)} />
        </div>
      </section>

      <section className="animate-reveal px-4 py-6 [animation-delay:100ms]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-mono-label">Presidente · 1º Turno</h2>
          <Link to="/resultados" className="font-mono text-[10px] font-bold uppercase tracking-tight text-accent">
            Ver tudo →
          </Link>
        </div>
        {(!totais || totais.length === 0) ? (
          <EmptyState message="Sem dados ainda — aguardando os primeiros BUs validados." />
        ) : (
          <div className="space-y-5">
            {totais.map((c, i) => {
              const max = totais[0]?.total_votos || 1;
              const pct = Number(c.total_votos) / Number(max) * 100;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-end justify-between">
                    <div>
                      <span className="block font-mono text-[10px] font-bold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-sm font-bold uppercase tracking-tight">Nº {c.candidato_numero}</span>
                    </div>
                    <span className="font-mono text-sm font-bold">{formatNum(Number(c.total_votos))}</span>
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

      <section className="animate-reveal px-4 py-6 [animation-delay:200ms]">
        <h2 className="text-mono-label mb-4">Cargos Apurados</h2>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(CARGOS).slice(0, 6).map((c) => (
            <div key={c.sigla} className="rounded-sm border border-border bg-card p-3">
              <span className="font-mono text-[10px] text-muted-foreground">{c.sigla}</span>
              <p className="text-sm font-bold">{c.nome}</p>
            </div>
          ))}
        </div>
      </section>

      {!user && (
        <section className="px-4 py-4">
          <Link to="/login" className="block rounded-sm bg-primary p-4 text-center text-sm font-bold uppercase text-primary-foreground">
            Entrar para colaborar
          </Link>
        </section>
      )}
    </AppShell>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-background p-3">
      <span className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">{label}</span>
      <span className={`font-mono text-xl font-bold tracking-tighter ${accent ? "text-accent" : ""}`}>{value}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{message}</p>;
}

function formatNum(n: number) {
  return n.toLocaleString("pt-BR");
}
