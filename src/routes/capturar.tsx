import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { QRScanner } from "@/components/QRScanner";
import { useAuth } from "@/hooks/useAuth";
import { validarBU } from "@/lib/validar-bu.functions";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export const Route = createFileRoute("/capturar")({
  head: () => ({ meta: [{ title: "Capturar BU · Totalização Paralela 2026" }] }),
  component: CapturarPage,
  validateSearch: (s: Record<string, unknown>) => ({ teste: s.teste === "1" }),
});

function CapturarPage() {
  const { teste } = Route.useSearch();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const validar = useServerFn(validarBU);
  const [result, setResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  if (!loading && !user) {
    return (
      <AppShell testMode={teste}>
        <div className="p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Entre para capturar BUs.</p>
          <Link to="/login" className="rounded-sm bg-primary px-4 py-2 text-sm font-bold uppercase text-primary-foreground">Entrar</Link>
        </div>
      </AppShell>
    );
  }

  async function handleComplete(qrs: string[]) {
    setProcessing(true);
    try {
      const r = await validar({ data: { qr_strings: qrs, modo_teste: teste } });
      setResult(r);
      if (r.sucesso) toast.success("BU validado!");
      else toast.error(r.erro);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <AppShell testMode={teste}>
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Escanear Boletim de Urna</h2>

        {processing && (
          <div className="rounded-sm border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Verificando assinatura Ed25519…
          </div>
        )}

        {!processing && !result && (
          <QRScanner onComplete={handleComplete} onCancel={() => nav({ to: "/" })} />
        )}

        {result && (
          <div className={`rounded-sm border p-4 ${result.sucesso ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
            <div className="flex items-center gap-2">
              {result.sucesso ? <CheckCircle2 className="size-5 text-success" /> :
                result.codigo === "DUPLICADO" ? <AlertTriangle className="size-5 text-warning" /> :
                <XCircle className="size-5 text-destructive" />}
              <span className="text-sm font-bold uppercase">{result.sucesso ? "BU Autêntico" : "Rejeitado"}</span>
            </div>
            <p className="mt-2 text-sm">{result.erro ?? `Zona ${result.zona} · Seção ${result.secao} · ${result.uf}`}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">Código: {result.codigo ?? "OK"}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setResult(null)} className="flex-1 rounded-sm bg-primary py-2 text-xs font-bold uppercase text-primary-foreground">
                Capturar outro
              </button>
              <Link to="/meus-bus" className="flex-1 rounded-sm border border-border py-2 text-center text-xs font-bold uppercase">
                Meus BUs
              </Link>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
