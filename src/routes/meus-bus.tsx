import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { anchorHashEVM } from "@/lib/evm-anchor";
import { toast } from "sonner";
import { ExternalLink, Link2 } from "lucide-react";

export const Route = createFileRoute("/meus-bus")({
  head: () => ({ meta: [{ title: "Meus BUs · Totalização Paralela 2026" }] }),
  component: MeusBUsPage,
});

function MeusBUsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [anchoring, setAnchoring] = useState<string | null>(null);

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

  async function ancorar(buId: string, hash: string) {
    setAnchoring(buId);
    try {
      const { txHash, explorerUrl, chainId } = await anchorHashEVM(hash);
      const { error } = await supabase.from("boletins").update({
        blockchain_tx: txHash,
        blockchain_explorer_url: explorerUrl,
        blockchain_chain_id: chainId,
      } as any).eq("id", buId);
      if (error) throw error;
      toast.success("Hash registrado em Sepolia.");
      qc.invalidateQueries({ queryKey: ["meus-bus", user?.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ancorar.");
    } finally {
      setAnchoring(null);
    }
  }

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
          <div className="space-y-2">
            {data.map((bu: any) => (
              <div key={bu.id} className="rounded-sm border border-border bg-card p-3">
                <div className="flex items-center justify-between">
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

                {bu.status === "validado" && (
                  <div className="mt-2 border-t border-border pt-2">
                    {bu.blockchain_tx ? (
                      <a
                        href={bu.blockchain_explorer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        On-chain: {bu.blockchain_tx.slice(0, 10)}…{bu.blockchain_tx.slice(-6)}
                      </a>
                    ) : (
                      <button
                        disabled={anchoring === bu.id}
                        onClick={() => ancorar(bu.id, bu.hash_final)}
                        className="flex items-center gap-1 rounded-sm border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-accent disabled:opacity-50"
                      >
                        <Link2 className="size-3" />
                        {anchoring === bu.id ? "Assinando…" : "Ancorar em Sepolia"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
