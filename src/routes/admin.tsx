import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { BuTerminal, type TerminalLine } from "@/components/BuTerminal";
import { ChavesPubPanel } from "@/components/ChavesPubPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { importarChaveTSE } from "@/lib/tse-keys.functions";
import { auditarBU } from "@/lib/auditor.functions";
import { UFS } from "@/lib/cargos";
import {
  Sparkles, Download, RefreshCw, CheckCircle2, XCircle, FileText, BookOpen, FileJson,
} from "lucide-react";

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

  if (loading) return <AppShell><div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div></AppShell>;
  if (!user) return <AppShell><div className="p-6 text-center"><Link to="/login" className="text-sm font-bold uppercase">Entrar</Link></div></AppShell>;
  if (!isMod) return <AppShell><div className="p-6 text-center text-sm text-muted-foreground">Acesso restrito a moderadores e admins.</div></AppShell>;

  return (
    <AppShell>
      <ChavesTSE />
      <ChavesPubPanel />
      <Moderacao />
      <ApiDocs />
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────── Chaves TSE
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
  const [syncBusy, setSyncBusy] = useState(false);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);

  const { data: chaves } = useQuery({
    queryKey: ["chaves-tse"],
    queryFn: async () => {
      const { data } = await supabase.from("chaves_tse").select("*").order("ano_eleicao", { ascending: false }).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const porAno = useMemo(() => {
    const m: Record<number, any[]> = {};
    for (const c of chaves ?? []) {
      const a = c.ano_eleicao ?? 0;
      (m[a] = m[a] ?? []).push(c);
    }
    return m;
  }, [chaves]);

  async function baixar() {
    if (!form.versao_chave) return toast.error("Informe a VRCH.");
    setBusy(true);
    try {
      const r = await importar({ data: form });
      if (r.sucesso) { toast.success(`Chave baixada (${form.sigla_uf}).`); qc.invalidateQueries({ queryKey: ["chaves-tse"] }); }
      else toast.error(r.erro ?? "Falha.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function baixarLote() {
    if (!form.versao_chave) return toast.error("Informe a VRCH.");
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

  async function sincronizarAgora() {
    setSyncBusy(true);
    setTerminal((t) => [...t, { ts: Date.now(), level: "info", text: "POST /api/public/hooks/sync-chaves-tse" }]);
    try {
      const r = await fetch("/api/public/hooks/sync-chaves-tse", { method: "POST" });
      const j = await r.json();
      setTerminal((t) => [...t,
        { ts: Date.now(), level: "ok", text: `Baixadas: ${j.baixadas} · ignoradas: ${j.ignoradas} · ${j.duracao_ms}ms` },
        { ts: Date.now(), level: "info", text: `VRCHs tentados: ${(j.vrchs_tentados ?? []).join(", ")}` },
      ]);
      if (j.erros?.length) setTerminal((t) => [...t, { ts: Date.now(), level: "warn", text: `Erros: ${j.erros.join(" | ")}` }]);
      toast.success(`Sincronização: ${j.baixadas} chaves baixadas.`);
      qc.invalidateQueries({ queryKey: ["chaves-tse"] });
    } catch (e: any) {
      setTerminal((t) => [...t, { ts: Date.now(), level: "err", text: e.message }]);
      toast.error(e.message);
    } finally { setSyncBusy(false); }
  }

  return (
    <section className="border-b border-border px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-mono-label">Chaves Públicas TSE</h2>
        <button onClick={() => setOpen((v) => !v)} className="rounded-sm bg-primary px-3 py-1 text-[10px] font-bold uppercase text-primary-foreground">
          {open ? "Fechar" : "+ Manual"}
        </button>
      </div>

      <button onClick={sincronizarAgora} disabled={syncBusy} className="mb-3 flex w-full items-center justify-center gap-2 rounded-sm bg-accent px-3 py-2.5 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50">
        <RefreshCw className={`size-3.5 ${syncBusy ? "animate-spin" : ""}`} />
        {syncBusy ? "Buscando…" : "Buscar chaves 2020/2022/2024/2026 do TSE"}
      </button>

      <BuTerminal lines={terminal} running={syncBusy} title="sync-chaves-tse" />

      {open && (
        <div className="my-4 space-y-2 rounded-sm border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.versao_chave} onChange={(e) => setForm({ ...form, versao_chave: e.target.value.trim() })} placeholder="VRCH (ex: 2024.1)" className="rounded-sm border border-border bg-background p-2 text-xs" />
            <select value={form.ano_eleicao} onChange={(e) => setForm({ ...form, ano_eleicao: parseInt(e.target.value, 10) })} className="rounded-sm border border-border bg-background p-2 text-xs">
              {[2020, 2022, 2024, 2026, 2028].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
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
          <div className="flex gap-2">
            <button disabled={busy} onClick={baixar} className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-accent px-3 py-2 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50">
              <Download className="size-3" /> Baixar
            </button>
            <button disabled={busy} onClick={baixarLote} className="flex-1 rounded-sm border border-border px-3 py-2 text-xs font-bold uppercase disabled:opacity-50">
              Lote (todas UFs)
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {Object.keys(porAno).length === 0 && (
          <p className="rounded-sm border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma chave cadastrada. Clique em "Buscar chaves" acima.
          </p>
        )}
        {Object.entries(porAno).sort(([a], [b]) => parseInt(b) - parseInt(a)).map(([ano, items]) => (
          <div key={ano}>
            <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Eleição {ano} · {items.length} chave(s)</p>
            <div className="space-y-1">
              {items.slice(0, 30).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-sm border border-border bg-card p-2 text-[11px]">
                  <span className="font-mono">{c.versao_chave} · {c.sigla_uf} · {c.fase} · {c.tipo_eleicao}</span>
                  <span className={`font-bold ${c.ativo ? "text-success" : "text-muted-foreground"}`}>{c.ativo ? "ATIVA" : "INATIVA"}</span>
                </div>
              ))}
              {items.length > 30 && <p className="text-center text-[9px] text-muted-foreground">+{items.length - 30} ocultas</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────── Moderação
function Moderacao() {
  const [filtro, setFiltro] = useState<"todos" | "validado" | "pendente" | "rejeitado">("todos");
  const [modoTesteFilter, setModoTesteFilter] = useState<"todos" | "prod" | "teste">("todos");

  const { data: bus, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-bus", filtro, modoTesteFilter],
    queryFn: async () => {
      let q = supabase.from("boletins").select("*").order("created_at", { ascending: false }).limit(100);
      if (filtro !== "todos") q = q.eq("status", filtro);
      if (modoTesteFilter === "prod") q = q.eq("modo_teste", false);
      if (modoTesteFilter === "teste") q = q.eq("modo_teste", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section className="border-b border-border px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-mono-label">Moderação · BUs</h2>
        <button onClick={() => refetch()} className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          <RefreshCw className="size-3" /> Atualizar
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["todos", "validado", "pendente", "rejeitado"] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={`rounded-sm border px-2 py-1 text-[10px] font-bold uppercase ${filtro === f ? "border-accent bg-accent/10 text-accent" : "border-border"}`}>
            {f}
          </button>
        ))}
        <span className="mx-1 text-muted-foreground">|</span>
        {(["todos", "prod", "teste"] as const).map((f) => (
          <button key={f} onClick={() => setModoTesteFilter(f)} className={`rounded-sm border px-2 py-1 text-[10px] font-bold uppercase ${modoTesteFilter === f ? "border-accent bg-accent/10 text-accent" : "border-border"}`}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Erro: {(error as Error).message}
        </div>
      )}
      {isLoading && <p className="text-center text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && bus && bus.length === 0 && (
        <p className="rounded-sm border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
          Nenhum BU encontrado com este filtro.
        </p>
      )}
      <div className="space-y-2">
        {(bus ?? []).map((bu) => <BURow key={bu.id} bu={bu} onChange={refetch} />)}
      </div>
    </section>
  );
}

function BURow({ bu, onChange }: { bu: any; onChange: () => void }) {
  const auditar = useServerFn(auditarBU);
  const [resultado, setResultado] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actBusy, setActBusy] = useState(false);

  async function rodar() {
    setLoading(true); setResultado(null);
    try {
      const r = await auditar({ data: { bu_id: bu.id } });
      if (r.erro) toast.error(r.erro);
      else setResultado(r.texto ?? "Sem resposta.");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function alterarStatus(novo: "validado" | "rejeitado", motivo?: string) {
    setActBusy(true);
    const { error } = await supabase.from("boletins").update({
      status: novo,
      motivo_rejeicao: novo === "rejeitado" ? (motivo ?? "Rejeitado pela moderação") : null,
    }).eq("id", bu.id);
    setActBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`BU marcado como ${novo}.`); onChange(); }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase">{bu.sigla_uf} · Z{bu.zona}/S{bu.secao}</span>
        <StatusBadge status={bu.status as any} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {bu.ano_eleicao} · turno {bu.num_turno} · {bu.modo_teste ? "TESTE" : "PROD"} · {new Date(bu.created_at).toLocaleString("pt-BR")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {bu.status === "validado" && (
          <button onClick={rodar} disabled={loading} className="flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary disabled:opacity-50">
            <Sparkles className="size-3" />{loading ? "Analisando…" : "Auditor IA"}
          </button>
        )}
        {bu.status !== "validado" && (
          <button onClick={() => alterarStatus("validado")} disabled={actBusy} className="flex items-center gap-1 rounded-sm border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase text-success disabled:opacity-50">
            <CheckCircle2 className="size-3" /> Validar
          </button>
        )}
        {bu.status !== "rejeitado" && (
          <button onClick={() => alterarStatus("rejeitado", "Rejeitado manualmente pela moderação")} disabled={actBusy} className="flex items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase text-destructive disabled:opacity-50">
            <XCircle className="size-3" /> Rejeitar
          </button>
        )}
      </div>
      {resultado && (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-2 text-[10px] leading-snug">
          {resultado}
        </pre>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── API Docs
type EndpointDoc = {
  metodo: "GET" | "POST";
  path: string;
  auth: "publico" | "autenticado" | "admin";
  descricao: string;
  parametros?: string;
  resposta: string;
};

const ENDPOINTS: EndpointDoc[] = [
  {
    metodo: "POST", path: "/api/public/hooks/sync-chaves-tse", auth: "publico",
    descricao: "Sincroniza chaves Ed25519 do TSE para 2020/2022/2024/ano corrente e próximo. Idempotente.",
    resposta: `{ ok: true, baixadas: number, ignoradas: number, erros: string[], duracao_ms: number, vrchs_tentados: string[] }`,
  },
  {
    metodo: "GET", path: "/api/public/v1/totais", auth: "publico",
    descricao: "Totais agregados por cargo. Query: ano, turno, uf?, cargo?",
    parametros: "?ano=2026&turno=1&uf=SP&cargo=1",
    resposta: `{ ok: true, ano, turno, uf, cargo, totais: [{ sigla_uf, cargo_codigo, candidato_numero, total_votos, total_bus_computados }] }`,
  },
  {
    metodo: "GET", path: "/api/public/v1/cobertura", auth: "publico",
    descricao: "Cobertura de seções validadas por UF/município.",
    parametros: "?ano=2026&uf=SP",
    resposta: `{ ok: true, ano, uf, cobertura: [{ sigla_uf, municipio_num, municipio_nome, total_bus_validados, percentual }] }`,
  },
  {
    metodo: "GET", path: "/api/public/v1/boletins/:id", auth: "publico",
    descricao: "Metadados + hash de um BU validado (sem PII).",
    resposta: `{ ok: true, boletim: { id, ano_eleicao, fase, sigla_uf, zona, secao, hash_final, versao_chave, ... } }`,
  },
  {
    metodo: "POST", path: "[serverFn] validarBU", auth: "autenticado",
    descricao: "Server function: parseia QRs, verifica Ed25519, persiste em boletins. Retorna etapas[].",
    parametros: `{ qr_strings: string[], modo_teste?: boolean }`,
    resposta: `{ sucesso, codigo?, bu_id?, hash_final?, etapas: [{ ts, level, text }] }`,
  },
  {
    metodo: "POST", path: "[serverFn] importarChaveTSE", auth: "admin",
    descricao: "Baixa uma chave Ed25519 específica do TSE.",
    parametros: `{ versao_chave, sigla_uf, tipo_eleicao, fase, ano_eleicao }`,
    resposta: `{ sucesso: boolean, url?: string, chave_publica_hex?: string, erro?: string }`,
  },
  {
    metodo: "POST", path: "[serverFn] auditarBU", auth: "admin",
    descricao: "Solicita análise do BU ao gateway NVIDIA AI.",
    parametros: `{ bu_id: string }`,
    resposta: `{ texto?: string, erro?: string }`,
  },
];

function ApiDocs() {
  const [open, setOpen] = useState(false);

  async function exportarCSV() {
    const header = ["metodo", "path", "auth", "descricao", "parametros", "resposta"];
    const rows = ENDPOINTS.map((e) => header.map((h) => `"${String((e as any)[h] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "api-totalizacao-paralela-2026.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  async function exportarPDF() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("API · Totalização Paralela 2026", 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Método", "Path", "Auth", "Descrição"]],
      body: ENDPOINTS.map((e) => [e.metodo, e.path, e.auth, e.descricao]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    let y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text("Detalhes", 14, y); y += 6;
    doc.setFontSize(8);
    for (const e of ENDPOINTS) {
      if (y > 270) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold");
      doc.text(`${e.metodo} ${e.path}`, 14, y); y += 4;
      doc.setFont("helvetica", "normal");
      if (e.parametros) { doc.text(`Params: ${e.parametros}`, 14, y); y += 4; }
      const resp = doc.splitTextToSize(`Resposta: ${e.resposta}`, 180);
      doc.text(resp, 14, y); y += resp.length * 4 + 4;
    }
    doc.save("api-totalizacao-paralela-2026.pdf");
    toast.success("PDF exportado.");
  }

  return (
    <section className="px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-accent" />
          <h2 className="text-mono-label">Documentação da API</h2>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-bold uppercase text-muted-foreground">
          {open ? "Fechar" : "Abrir"}
        </button>
      </div>

      {open && (
        <>
          <div className="mb-3 flex gap-2">
            <button onClick={exportarPDF} className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-secondary px-3 py-2 text-[10px] font-bold uppercase">
              <FileText className="size-3" /> Exportar PDF
            </button>
            <button onClick={exportarCSV} className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-border px-3 py-2 text-[10px] font-bold uppercase">
              <FileJson className="size-3" /> Exportar CSV
            </button>
          </div>

          <div className="space-y-2">
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="rounded-sm border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-bold ${e.metodo === "GET" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>
                    {e.metodo}
                  </span>
                  <code className="font-mono text-[11px] break-all">{e.path}</code>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  <span className="font-bold uppercase">{e.auth}</span> · {e.descricao}
                </p>
                {e.parametros && (
                  <pre className="mt-2 overflow-x-auto rounded-sm bg-background p-2 font-mono text-[9px]">{e.parametros}</pre>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase text-muted-foreground">Resposta</summary>
                  <pre className="mt-1 overflow-x-auto rounded-sm bg-background p-2 font-mono text-[9px]">{e.resposta}</pre>
                </details>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
