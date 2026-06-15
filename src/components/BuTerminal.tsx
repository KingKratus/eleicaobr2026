import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

export interface TerminalLine {
  ts: number;
  level: "info" | "ok" | "warn" | "err";
  text: string;
}

interface Props {
  lines: TerminalLine[];
  title?: string;
  running?: boolean;
}

/**
 * Terminal estilo console que exibe as etapas reais do processamento
 * do Boletim de Urna (parser → chave → assinatura → hash → persist).
 */
export function BuTerminal({ lines, title = "BU · execução", running = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  const color: Record<TerminalLine["level"], string> = {
    info: "text-foreground/80",
    ok: "text-success",
    warn: "text-warning",
    err: "text-destructive",
  };
  const prefix: Record<TerminalLine["level"], string> = {
    info: ">",
    ok: "✓",
    warn: "!",
    err: "✗",
  };

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-black">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Terminal className="size-3" />
          {title}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${running ? "animate-pulse bg-success" : "bg-muted"}`} />
          <span className="font-mono text-[9px] uppercase text-muted-foreground">
            {running ? "running" : "idle"}
          </span>
        </div>
      </div>
      <div
        ref={ref}
        className="max-h-64 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed"
      >
        {lines.length === 0 && (
          <p className="text-muted-foreground/50">[aguardando execução…]</p>
        )}
        {lines.map((l, i) => (
          <div key={i} className={color[l.level]}>
            <span className="text-muted-foreground/60">
              [{new Date(l.ts).toLocaleTimeString("pt-BR", { hour12: false })}]
            </span>{" "}
            <span className="text-accent">{prefix[l.level]}</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
