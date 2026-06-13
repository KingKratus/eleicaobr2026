import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X, LayoutDashboard, BarChart3, Map, User, ScanLine, Shield, FlaskConical, Info, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const baseItems = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/resultados", label: "Resultados", icon: BarChart3 },
  { to: "/mapa", label: "Mapa", icon: Map },
  { to: "/capturar", label: "Capturar BU", icon: ScanLine },
  { to: "/meus-bus", label: "Meus BUs", icon: ScanLine },
  { to: "/testes", label: "Lab de Testes", icon: FlaskConical },
  { to: "/sobre", label: "Metodologia", icon: Info },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function PizzaMenu() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  const { data: isMod } = useQuery({
    queryKey: ["is-mod", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      return (data ?? []).some((r) => r.role === "moderador" || r.role === "admin");
    },
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const overlay = (
    <div className="fixed inset-0 z-[100] flex" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
      <aside
        className="relative ml-auto flex h-full w-[min(320px,85vw)] flex-col border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-mono-label">Menu</span>
          <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></button>
        </header>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {baseItems.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-bold uppercase tracking-tight text-foreground transition-colors hover:bg-accent/10"
              >
                <Icon className="size-4 text-accent" />
                {it.label}
              </Link>
            );
          })}

          {isMod && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-bold uppercase tracking-tight text-primary transition-colors hover:bg-primary/10"
              >
                <Shield className="size-4" />
                Administração
              </Link>
            </>
          )}

          {user && (
            <>
              <div className="my-3 border-t border-border" />
              <button
                onClick={async () => { await supabase.auth.signOut(); setOpen(false); }}
                className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-bold uppercase tracking-tight text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </>
          )}
          {!user && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-sm bg-primary px-3 py-2.5 text-sm font-bold uppercase tracking-tight text-primary-foreground"
              >
                Entrar / Criar conta
              </Link>
            </>
          )}
        </nav>

        <footer className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
          v1 · Fonte aberta
        </footer>
      </aside>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="flex size-9 items-center justify-center rounded-sm border border-border bg-card text-foreground transition-colors hover:bg-accent/10"
      >
        <Menu className="size-4" strokeWidth={2.5} />
      </button>
      {open && typeof document !== "undefined" && createPortal(overlay, document.body)}
    </>
  );
}
