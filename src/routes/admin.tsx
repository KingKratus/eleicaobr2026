import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { importarChaveTSE } from "@/lib/tse-keys.functions";
import { auditarBU } from "@/lib/auditor.functions";
import { UFS } from "@/lib/cargos";
import { Sparkles, Download } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Moderação · Totalização Paralela 2026" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();

  const { data: role } = useQuery({
    queryKey: ["role", user?.id],
    queryFn: async () => {
      if (!user) return [];
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
      <ChavesTSE />
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Moderação · Últimos 100 BUs</h2>
        <div className="space-y-2">
          {(bus ?? []).map((bu) => (
            <BURow key={bu.id} bu={bu} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function BURow({ bu }: { bu: any }) {
  const auditar = useServerFn(auditarBU);
  const [resultado, setResultado] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function rodar() {
    setLoading(true);
    setResultado(null);
    try {
      const r = await auditar({ data: { bu_id: bu.id } });
      if (r.erro) toast.error(r.erro);
      else setResultado(r.texto ?? "Sem resposta.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase">{bu.sigla_uf} · Z{bu.zona}/S{bu.secao}</span>
        <StatusBadge status={bu.status as any} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {bu.ano_eleicao} · turno {bu.num_turno} · {bu.modo_teste ? "TESTE" : "PROD"}
      </p>
      {bu.status === "validado" && (
        <button
          onClick={rodar}
          disabled={loading}
          className="mt-2 flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary disabled:opacity-50"
        >
          <Sparkles className="size-3" />
          {loading ? "Analisando…" : "Auditor IA (NVIDIA)"}
        </button>
      )}
      {resultado && (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-2 text-[10px] leading-snug">
          {resultado}
        </pre>
      )}
    </div>
  );
}

function ChavesTSE() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const importar = useServerFn(importarChaveTSE);
  const [form, setForm] = useState({
    versao_chave: "",
    sigla_uf: "BR",
    tipo_eleicao: "LEGAL" as "LEGAL" | "COMUNITARIA",
    fase: "O" as "O" | "S" | "T",
    ano_eleicao: 2026,
  });
  const [busy, setBusy] = useState(false);

  const { data: chaves } = useQuery({
    queryKey: ["chaves-tse"],
    queryFn: async () => {
      const { data } = await supabase.from("chaves_tse").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function baixar() {
    if (!form.versao_chave) return toast.error("Informe a versão da chave (VRCH).");
    setBusy(true);
    try {
      const r = await importar({ data: form });
      if (r.sucesso) {
        toast.success(`Chave baixada (${form.sigla_uf}).`);
        qc.invalidateQueries({ queryKey: ["chaves-tse"] });
      } else toast.error(r.erro ?? "Falha.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function baixarLote() {
    if (!form.versao_chave) return toast.error("Informe a versão da chave (VRCH).");
    setBusy(true);
    let ok = 0, fail = 0;
    for (const uf of UFS) {
      try {
        const r = await importar({ data: { ...form, sigla_uf: uf } });
        if (r.sucesso) ok++; else fail++;
      } catch { fail++; }
    }
    setBusy(false);
    toast.success(`Lote: ${ok} ok, ${fail} falhas.`);
    qc.invalidateQueries({ queryKey: ["chaves-tse"] });
  }

  return (
    <section className="border-b border-border px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-mono-label">Chaves Públicas TSE</h2>
        <button onClick={() => setOpen((v) => !v)} className="rounded-sm bg-primary px-3 py-1 text-[10px] font-bold uppercase text-primary-foreground">
          {open ? "Fechar" : "+ Importar"}
        </button>
      </div>

      {open && (
        <div className="mb-4 space-y-2 rounded-sm border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.versao_chave} onChange={(e) => setForm({ ...form, versao_chave: e.target.value.trim() })} placeholder="VRCH (ex: 20260801)" className="rounded-sm border border-border bg-background p-2 text-xs" />
            <select value={form.sigla_uf} onChange={(e) => setForm({ ...form, sigla_uf: e.target.value })} className="rounded-sm border border-border bg-background p-2 text-xs">
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={form.tipo_eleicao} onChange={(e) => setForm({ ...form, tipo_eleicao: e.target.value as any })} className="rounded-sm border border-border bg-background p-2 text-xs">
              <option value="LEGAL">LEGAL</option>
              <option value="COMUNITARIA">COMUNITARIA</option>
            </select>
            <select value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value as any })} className="rounded-sm border border-border bg-background p-2 text-xs">
              <option value="O">O (Oficial)</option>
              <option value="S">S (Simulado)</option>
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Baixa de <code className="font-mono">qrcodenobu.tse.jus.br</code> e grava em formato hex.
          </p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={baixar} className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-accent px-3 py-2 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50">
              <Download className="size-3" /> Baixar do TSE
            </button>
            <button disabled={busy} onClick={baixarLote} className="flex-1 rounded-sm border border-border px-3 py-2 text-xs font-bold uppercase disabled:opacity-50">
              Lote (todas UFs)
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {(chaves ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-sm border border-border bg-card p-2 text-[11px]">
            <span className="font-mono">{c.versao_chave} · {c.sigla_uf} · {c.fase} · {c.tipo_eleicao}</span>
            <span className={`font-bold ${c.ativo ? "text-success" : "text-muted-foreground"}`}>{c.ativo ? "ATIVA" : "INATIVA"}</span>
          </div>
        ))}
        {(!chaves || chaves.length === 0) && (
          <p className="rounded-sm border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma chave cadastrada. Use "Lote (todas UFs)" após o TSE publicar as chaves de 2026.
          </p>
        )}
      </div>
    </section>
  );
}
