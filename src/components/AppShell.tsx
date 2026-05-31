import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  testMode?: boolean;
  rightSlot?: ReactNode;
}

export function AppShell({ children, title = "Totalização", subtitle = "Paralela 2026", testMode = false, rightSlot }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[440px] flex-col overflow-x-hidden bg-background text-foreground">
      {testMode && (
        <div className="sticky top-0 z-50 border-b border-amber-300/40 bg-warning/95 px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-warning-foreground">
          Modo de Treinamento — dados não contam para 2026
        </div>
      )}

      <header className={`sticky ${testMode ? "top-[26px]" : "top-0"} z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md`}>
        <div className="flex flex-col">
          <span className="text-sm font-extrabold uppercase leading-none tracking-tighter">{title}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</span>
        </div>
        {rightSlot ?? (
          <div className="flex items-center gap-2 rounded-sm border border-accent/20 bg-accent/10 px-2 py-1">
            <div className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-tight text-accent">
              {testMode ? "Sandbox" : "Auditoria Ativa"}
            </span>
          </div>
        )}
      </header>

      <main className="flex-1 pb-32">{children}</main>

      <BottomNav />
    </div>
  );
}
