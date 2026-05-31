import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Moderação · Totalização Paralela 2026" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();

  const { data: role } = useQuery({
    queryKey: ["role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isMod = role?.some((r) => r.role === "moderador" || r.role === "admin");

  const { data: bus } = useQuery({
    queryKey: ["admin-bus"],
    queryFn: async () => {
      const { data } = await supabase.from("boletins").select("*").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
    enabled: !!isMod,
  });

  if (loading) return <AppShell><div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div></AppShell>;
  if (!user) return <AppShell><div className="p-6 text-center"><Link to="/login" className="text-sm font-bold uppercase">Entrar</Link></div></AppShell>;
  if (!isMod) return <AppShell><div className="p-6 text-center text-sm text-muted-foreground">Acesso restrito a moderadores.</div></AppShell>;

  return (
    <AppShell>
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Moderação · Últimos 100</h2>
        <div className="space-y-1">
          {(bus ?? []).map((bu) => (
            <div key={bu.id} className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase">{bu.sigla_uf} · Z{bu.zona}/S{bu.secao}</span>
                <StatusBadge status={bu.status as any} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {bu.ano_eleicao} · turno {bu.num_turno} · {bu.modo_teste ? "TESTE" : "PROD"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
