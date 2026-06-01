import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
      <ChavesTSE />
      <section className="px-4 py-6">
        <h2 className="text-mono-label mb-4">Moderação · Últimos 100 BUs</h2>
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

function ChavesTSE() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    versao_chave: "",
    sigla_uf: "BR",
    tipo_eleicao: "LEGAL",
    fase: "O",
    ano_eleicao: 2026,
    chave_publica_hex: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: chaves } = useQuery({
    queryKey: ["chaves-tse"],
    queryFn: async () => {
      const { data } = await supabase.from("chaves_tse").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function salvar() {
    if (!form.versao_chave || form.chave_publica_hex.length !== 64) {
      toast.error("Versão obrigatória e chave hex de 32 bytes (64 chars).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("chaves_tse").insert({ ...form, ativo: true });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Chave TSE cadastrada.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["chaves-tse"] });
    }
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
            <input value={form.versao_chave} onChange={(e) => setForm({ ...form, versao_chave: e.target.value })} placeholder="VRCH (ex: 2026.1)" className="rounded-sm border border-border bg-background p-2 text-xs" />
            <input value={form.sigla_uf} onChange={(e) => setForm({ ...form, sigla_uf: e.target.value.toUpperCase() })} placeholder="UF (BR p/ nacional)" maxLength={2} className="rounded-sm border border-border bg-background p-2 text-xs" />
            <select value={form.tipo_eleicao} onChange={(e) => setForm({ ...form, tipo_eleicao: e.target.value })} className="rounded-sm border border-border bg-background p-2 text-xs">
              <option value="LEGAL">LEGAL</option>
              <option value="COMUNITARIA">COMUNITARIA</option>
            </select>
            <select value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value })} className="rounded-sm border border-border bg-background p-2 text-xs">
              <option value="O">O (Oficial)</option>
              <option value="S">S (Simulado)</option>
              <option value="T">T (Treinamento)</option>
            </select>
            <input type="number" value={form.ano_eleicao} onChange={(e) => setForm({ ...form, ano_eleicao: Number(e.target.value) })} className="col-span-2 rounded-sm border border-border bg-background p-2 text-xs" />
          </div>
          <textarea value={form.chave_publica_hex} onChange={(e) => setForm({ ...form, chave_publica_hex: e.target.value.trim().toLowerCase() })} placeholder="Chave pública Ed25519 (64 chars hex)" rows={3} className="w-full rounded-sm border border-border bg-background p-2 font-mono text-xs" />
          <button disabled={saving} onClick={salvar} className="w-full rounded-sm bg-accent px-3 py-2 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50">
            {saving ? "Salvando…" : "Cadastrar chave"}
          </button>
        </div>
      )}

      <div className="space-y-1">
        {(chaves ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-sm border border-border bg-card p-2 text-[11px]">
            <span className="font-mono">{c.versao_chave} · {c.sigla_uf} · {c.fase}</span>
            <span className={`font-bold ${c.ativo ? "text-success" : "text-muted-foreground"}`}>{c.ativo ? "ATIVA" : "INATIVA"}</span>
          </div>
        ))}
        {(!chaves || chaves.length === 0) && (
          <p className="rounded-sm border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma chave cadastrada. Importe as chaves TSE oficiais para habilitar a validação.
          </p>
        )}
      </div>
    </section>
  );
}
