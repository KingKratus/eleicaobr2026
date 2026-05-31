import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { UFS } from "@/lib/cargos";

export const Route = createFileRoute("/mapa")({
  head: () => ({ meta: [{ title: "Mapa de Cobertura · Totalização Paralela 2026" }] }),
  component: MapaPage,
});

function MapaPage() {
  const { data } = useQuery({
    queryKey: ["cobertura-uf"],
    queryFn: async () => {
      const { data } = await supabase.from("cobertura").select("sigla_uf, total_bus_validados").eq("ano_eleicao", 2026);
      const agg: Record<string, number> = {};
      (data ?? []).forEach((r) => { agg[r.sigla_uf] = (agg[r.sigla_uf] ?? 0) + r.total_bus_validados; });
      return agg;
    },
    refetchInterval: 15000,
  });

  const max = Math.max(1, ...Object.values(data ?? {}));

  return (
    <AppShell>
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Cobertura por UF</h2>
        <div className="grid grid-cols-4 gap-2">
          {UFS.filter(u => u !== "ZZ").map((uf) => {
            const v = data?.[uf] ?? 0;
            const intensity = v / max;
            return (
              <div key={uf} className="aspect-square rounded-sm border border-border p-2 flex flex-col justify-between"
                style={{ backgroundColor: `oklch(0.71 ${0.16 * intensity} 50 / ${0.1 + intensity * 0.9})` }}>
                <span className="font-mono text-xs font-bold">{uf}</span>
                <span className="font-mono text-[10px]">{v}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Mais escuro = maior número de BUs validados.</p>
      </section>
    </AppShell>
  );
}
