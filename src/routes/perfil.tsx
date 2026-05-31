import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Perfil · Totalização Paralela 2026" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, signOut, loading } = useAuth();
  const nav = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
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
      <section className="px-4 py-6 space-y-4">
        <div>
          <h2 className="text-mono-label">Conta</h2>
          <p className="mt-2 text-lg font-bold">{profile?.nome ?? user?.email}</p>
          <p className="font-mono text-xs text-muted-foreground">{user?.email}</p>
        </div>

        <div className="space-y-2">
          <Link to="/meus-bus" className="block rounded-sm border border-border p-3 text-sm font-bold uppercase">Meus BUs</Link>
          <Link to="/testes" className="block rounded-sm border border-border p-3 text-sm font-bold uppercase">Modo de Treinamento</Link>
          <Link to="/admin" className="block rounded-sm border border-border p-3 text-sm font-bold uppercase">Painel de Moderação</Link>
        </div>

        <button onClick={async () => { await signOut(); nav({ to: "/" }); }} className="w-full rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm font-bold uppercase text-destructive">
          Sair
        </button>
      </section>
    </AppShell>
  );
}
