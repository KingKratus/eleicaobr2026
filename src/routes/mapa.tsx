import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BusPanel } from "@/components/BusPanel";
import { supabase } from "@/integrations/supabase/client";
import { UFS } from "@/lib/cargos";

type Search = { teste?: number; ano?: number; turno?: number };

export const Route = createFileRoute("/mapa")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    teste: s.teste ? 1 : undefined,
    ano: s.ano ? Number(s.ano) : undefined,
    turno: Number(s.turno) === 2 ? 2 : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Mapa de Cobertura · Totalização Paralela 2026" },
      { name: "description", content: "Mapa em tempo real da cobertura de Boletins de Urna validados por UF e município, com camada separada para o modo de treinamento." },
      { property: "og:title", content: "Mapa de Cobertura · Totalização Paralela 2026" },
      { property: "og:description", content: "Cobertura geográfica dos Boletins de Urna validados pela rede paralela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapaPage,
});

const BrazilMap = lazy(() => import("@/components/BrazilMap"));

type UfRow = { uf: string; bus: number; municipios: number };
type MunRow = { municipio_num: number; municipio_nome: string | null; total_bus_validados: number };

const ANOS_TESTE = [2026, 2024, 2022, 2020, 2018];

function MapaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const teste = search.teste === 1;

  // Anos que realmente têm boletins nesta camada
  const { data: anosDisp = [] } = useQuery({
    queryKey: ["anos-disponiveis", teste],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("anos_disponiveis", { _teste: teste });
      return (data ?? []) as { ano: number; bus: number }[];
    },
    staleTime: 60_000,
  });

  const anosOpcoes = Array.from(
    new Set([...anosDisp.map((a) => Number(a.ano)), ...ANOS_TESTE]),
  ).sort((a, b) => b - a);

  const ano = search.ano ?? (teste ? Number(anosDisp[0]?.ano ?? 2024) : 2026);
  const turno = search.turno === 2 ? 2 : 1;

  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setUfSelecionada(null); }, [teste, ano, turno]);

  // Payload mínimo: 1 linha por UF (~27 linhas, 3 colunas) via RPC agregadora.
  const { data: ufs = [] } = useQuery({
    queryKey: ["mapa-uf", ano, teste, turno],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("mapa_uf_turno", { _ano: ano, _turno: turno, _teste: teste });
      return (data ?? []) as UfRow[];
    },
    staleTime: 30_000,
    refetchInterval: teste ? 8_000 : 60_000,
  });

  // Municípios só são buscados quando o usuário abre uma UF.
  const { data: municipios = [], isFetching: carregandoMun } = useQuery({
    queryKey: ["mapa-mun", ano, teste, turno, ufSelecionada],
    enabled: !!ufSelecionada,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("mapa_mun_turno", {
        _ano: ano, _turno: turno, _teste: teste, _uf: ufSelecionada,
      });
      return ((data ?? []) as { municipio_num: number; municipio_nome: string | null; bus: number }[]).map((m) => ({
        municipio_num: m.municipio_num,
        municipio_nome: m.municipio_nome,
        total_bus_validados: Number(m.bus),
      })) as MunRow[];
    },
  });



  const porUf: Record<string, number> = {};
  ufs.forEach((r) => { porUf[r.uf] = Number(r.bus); });
  const totalBR = ufs.reduce((a, b) => a + Number(b.bus), 0);
  const totalMun = ufs.reduce((a, b) => a + Number(b.municipios), 0);
  const maxUf = Math.max(1, ...Object.values(porUf));

  function setModo(next: boolean) {
    navigate({ search: next ? { teste: 1, turno: turno === 2 ? 2 : undefined } : { turno: turno === 2 ? 2 : undefined }, replace: true });
  }

  return (
    <AppShell testMode={teste}>
      <section className="border-b border-border px-4 py-5">
        <h1 className="text-mono-label">Mapa de cobertura</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {teste
            ? "Camada de treinamento: BUs de eleições passadas validados no laboratório. Não contam para 2026."
            : "Boletins de urna oficiais validados pela rede paralela. Toque um estado para detalhar municípios."}
        </p>

        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => setModo(false)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${!teste ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}
          >
            Oficial 2026
          </button>
          <button
            onClick={() => setModo(true)}
            className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${teste ? "border-warning bg-warning/10 text-warning" : "border-border text-muted-foreground"}`}
          >
            Treinamento
          </button>
          {teste && (
            <select
              value={ano}
              onChange={(e) => navigate({ search: { teste: 1, ano: Number(e.target.value), turno: turno === 2 ? 2 : undefined }, replace: true })}
              className="rounded-sm border border-border bg-background px-2 text-[11px]"
            >
              {anosOpcoes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>

        <div className="mt-2 flex gap-1.5">
          {[1, 2].map((t) => (
            <button
              key={t}
              onClick={() => navigate({
                search: { teste: teste ? 1 : undefined, ano: search.ano, turno: t === 2 ? 2 : undefined },
                replace: true,
              })}
              className={`flex-1 rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${turno === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {t}º turno
            </button>
          ))}
        </div>


        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Metric label="UFs ativas" value={ufs.length} />
          <Metric label="Municípios" value={totalMun} />
          <Metric label="BUs totais" value={totalBR} />
        </div>
      </section>

      <section className="px-4 py-4">
        <div className="h-[55vh] min-h-[320px] overflow-hidden rounded-sm border border-border bg-card">
          {mounted ? (
            <Suspense fallback={<MapPlaceholder />}>
              <BrazilMap
                porUf={porUf}
                maxUf={maxUf}
                ufSelecionada={ufSelecionada}
                onSelectUf={setUfSelecionada}
              />
            </Suspense>
          ) : (
            <MapPlaceholder />
          )}
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
            <button onClick={() => { setUfSelecionada(null); setMunSel(null); }} className="text-[10px] font-bold uppercase text-muted-foreground">
              Limpar
            </button>
          </div>
          {carregandoMun && municipios.length === 0 ? (
            <p className="text-xs text-muted-foreground">Carregando municípios…</p>
          ) : municipios.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum BU validado neste estado ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-sm border border-border">
              {municipios.map((m) => (
                <li key={m.municipio_num}>
                  <button
                    onClick={() => setMunSel(munSel === m.municipio_num ? null : m.municipio_num)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors ${munSel === m.municipio_num ? "bg-accent/10" : "hover:bg-accent/5"}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.municipio_nome ?? `Município ${m.municipio_num}`}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">cód. {m.municipio_num}</p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold">
                      {m.total_bus_validados} BU{m.total_bus_validados === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5">
            <BusPanel ano={ano} turno={turno} teste={teste} uf={ufSelecionada} municipio={munSel} />
          </div>
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
