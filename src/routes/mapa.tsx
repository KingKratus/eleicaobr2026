import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { UFS } from "@/lib/cargos";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de Cobertura · Totalização Paralela 2026" },
      { name: "description", content: "Visualização geográfica em tempo real da cobertura de Boletins de Urna validados, com detalhamento por UF, município, zona e seção." },
    ],
  }),
  component: MapaPage,
});

const BrazilMap = lazy(() => import("@/components/BrazilMap"));

type CoberturaRow = {
  sigla_uf: string;
  municipio_num: number;
  municipio_nome: string | null;
  total_bus_validados: number;
};

function MapaPage() {
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["cobertura-detalhada"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cobertura")
        .select("sigla_uf, municipio_num, municipio_nome, total_bus_validados")
        .eq("ano_eleicao", 2026);
      return (data ?? []) as CoberturaRow[];
    },
    refetchInterval: 20000,
  });

  // Agregados por UF
  const porUf: Record<string, number> = {};
  rows.forEach((r) => { porUf[r.sigla_uf] = (porUf[r.sigla_uf] ?? 0) + r.total_bus_validados; });
  const totalBR = Object.values(porUf).reduce((a, b) => a + b, 0);
  const maxUf = Math.max(1, ...Object.values(porUf));

  const municipiosUf = ufSelecionada
    ? rows
        .filter((r) => r.sigla_uf === ufSelecionada)
        .sort((a, b) => b.total_bus_validados - a.total_bus_validados)
    : [];

  return (
    <AppShell>
      <section className="border-b border-border px-4 py-5">
        <h1 className="text-mono-label">Mapa de cobertura</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Boletins de urna validados pela rede paralela. Toque um estado no mapa para detalhar municípios.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Metric label="UFs ativas" value={Object.keys(porUf).length} />
          <Metric label="Municípios" value={rows.length} />
          <Metric label="BUs totais" value={totalBR} />
        </div>
      </section>

      <section className="px-4 py-4">
        <div className="h-[55vh] min-h-[320px] overflow-hidden rounded-sm border border-border bg-card">
          <Suspense fallback={<MapPlaceholder />}>
            <BrazilMap
              porUf={porUf}
              maxUf={maxUf}
              ufSelecionada={ufSelecionada}
              onSelectUf={setUfSelecionada}
            />
          </Suspense>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Tiles © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
          {" · "}Fronteiras: GeoJSON público (click_that_hood)
        </p>
      </section>

      <section className="border-t border-border px-4 py-4">
        <h2 className="text-mono-label mb-3">Ranking por UF</h2>
        <div className="grid grid-cols-4 gap-1.5">
          {UFS.filter((u) => u !== "ZZ").map((uf) => {
            const v = porUf[uf] ?? 0;
            const intensity = v / maxUf;
            const active = ufSelecionada === uf;
            return (
              <button
                key={uf}
                onClick={() => setUfSelecionada(active ? null : uf)}
                className={`aspect-square rounded-sm border p-1.5 text-left transition-colors ${
                  active ? "border-accent ring-1 ring-accent" : "border-border"
                }`}
                style={{ backgroundColor: `oklch(0.71 ${0.16 * intensity} 50 / ${0.08 + intensity * 0.85})` }}
              >
                <span className="block font-mono text-[11px] font-bold">{uf}</span>
                <span className="block font-mono text-[9px]">{v}</span>
              </button>
            );
          })}
        </div>
      </section>

      {ufSelecionada && (
        <section className="border-t border-border px-4 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-mono-label">{ufSelecionada} · municípios</h2>
            <button onClick={() => setUfSelecionada(null)} className="text-[10px] font-bold uppercase text-muted-foreground">
              Limpar
            </button>
          </div>
          {municipiosUf.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum BU validado neste estado ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-sm border border-border">
              {municipiosUf.slice(0, 50).map((m) => (
                <li key={`${m.sigla_uf}-${m.municipio_num}`} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.municipio_nome ?? `Município ${m.municipio_num}`}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">cód. {m.municipio_num}</p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold">
                    {m.total_bus_validados} BU{m.total_bus_validados === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {municipiosUf.length > 50 && (
            <p className="mt-2 text-[10px] text-muted-foreground">Mostrando 50 de {municipiosUf.length}.</p>
          )}
        </section>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-card px-2 py-2">
      <p className="font-mono text-base font-bold">{value.toLocaleString("pt-BR")}</p>
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Carregando mapa…
    </div>
  );
}
