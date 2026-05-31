import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/meus-bus")({
  head: () => ({ meta: [{ title: "Meus BUs · Totalização Paralela 2026" }] }),
  component: MeusBUsPage,
});

function MeusBUsPage() {
  const { user, loading } = useAuth();

  const { data } = useQuery({
    queryKey: ["meus-bus", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("boletins").select("*")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    enabled: !!user,
  });

  if (!loading && !user) {
    return (
      <AppShell><div className="p-6 text-center text-sm">
        <Link to="/login" className="rounded-sm bg-primary px-4 py-2 font-bold uppercase text-primary-foreground">Entrar</Link>
      </div></AppShell>
    );
  }

  return (
    <AppShell>
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Meus Envios</h2>
        {(!data || data.length === 0) ? (
          <p className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Você ainda não enviou BUs.
          </p>
        ) : (
          <div className="space-y-1">
            {data.map((bu) => (
              <div key={bu.id} className="flex items-center justify-between rounded-sm border border-border bg-card p-3">
                <div className="flex flex-col">
                  <span className="font-mono text-[11px] uppercase text-muted-foreground">
                    Zona {String(bu.zona).padStart(3, "0")} / Seção {String(bu.secao).padStart(4, "0")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {bu.sigla_uf} · {new Date(bu.created_at).toLocaleString("pt-BR")}
                    {bu.modo_teste && " · TESTE"}
                  </span>
                </div>
                <StatusBadge status={bu.status as any} />
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
