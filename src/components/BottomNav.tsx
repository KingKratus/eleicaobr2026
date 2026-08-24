import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, BarChart3, LineChart, Map, ScanLine } from "lucide-react";

const items = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/resultados", label: "Resultados", icon: BarChart3 },
  { to: "/mapa", label: "Mapa", icon: Map },
  { to: "/insights", label: "Insights", icon: LineChart },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[440px] -translate-x-1/2 items-center justify-between border-t border-border bg-background px-4 pt-2 pb-6">
      {items.slice(0, 2).map((it) => {
        const Icon = it.icon;
        const active = pathname === it.to;
        return (
          <Link key={it.to} to={it.to} className={`flex flex-1 flex-col items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground/60"}`}>
            <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-tight">{it.label}</span>
          </Link>
        );
      })}

      {/* FAB capturar */}
      <div className="-mt-10 flex-1 flex justify-center">
        <Link
          to="/capturar"
          search={{ teste: false }}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/20 ring-4 ring-background transition-transform active:scale-95"
          aria-label="Capturar BU"
        >
          <div className="flex flex-col items-center leading-none">
            <ScanLine className="size-5" strokeWidth={2.5} />
            <span className="mt-0.5 text-[8px] font-bold uppercase">BU</span>
          </div>
        </Link>
      </div>

      {items.slice(2).map((it) => {
        const Icon = it.icon;
        const active = pathname === it.to;
        return (
          <Link key={it.to} to={it.to} className={`flex flex-1 flex-col items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground/60"}`}>
            <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-tight">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
