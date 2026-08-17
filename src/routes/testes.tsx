import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BuTerminal, type TerminalLine } from "@/components/BuTerminal";
import { useAuth } from "@/hooks/useAuth";
import { validarBU } from "@/lib/validar-bu.functions";
import { parseQRs } from "@/lib/bu-parser";
import { anchorHashEVM } from "@/lib/evm-anchor";
import {
  computeIpfsCid, publishNostrAnchor, IPFS_GATEWAYS, NOSTR_GATEWAYS,
  verifyIpfsCid, verifyNostrEvent,
} from "@/lib/decentralized-anchor";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, XCircle, AlertTriangle, FlaskConical, FileText, Trash2,
  Anchor, ExternalLink, KeyRound, Save, FolderOpen, PlayCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/testes")({
  head: () => ({ meta: [{ title: "Laboratório de Testes · Totalização Paralela 2026" }] }),
  component: TestesPage,
});

const EXEMPLOS: { nome: string; descricao: string; codigo_esperado: string; qrs: string[] }[] = [
  {
    nome: "BU mal formado",
    descricao: "Falta o cabeçalho HASH no único QR.",
    codigo_esperado: "PARSE_ERRO",
    qrs: ["QRBU:1:1 VRQR:1.0 VRCH:2026.1 DTPL:20261004 FASE:O UNFE:SP ZONA:001 SECA:0001"],
  },
  {
    nome: "BU 2024 em produção",
    descricao: "DTPL aponta para 2024 — deve ser rejeitado fora do modo teste.",
    codigo_esperado: "ANO_INVALIDO",
    qrs: ["QRBU:1:1 VRQR:1.0 VRCH:2024.1 DTPL:20241006 FASE:O UNFE:SP MUNI:71072 ZONA:001 SECA:0001 TURN:1 IDCA:TEST APTO:300 COMP:250 CARG:11 CAND:13 VOTO:120 CAND:22 VOTO:100 BRAN:15 NULO:15 HASH:abc123def456 ASSI:0000000000000000000000000000000000000000000000000000000000000000"],
  },
  {
    nome: "BU 2026 sem chave TSE",
    descricao: "Estrutura válida, mas a chave pública VRCH ainda não foi importada.",
    codigo_esperado: "CHAVE_NAO_ENCONTRADA",
    qrs: ["QRBU:1:1 VRQR:1.0 VRCH:2026.1 DTPL:20261004 FASE:O UNFE:SP MUNI:71072 ZONA:001 SECA:0001 TURN:1 IDCA:TEST APTO:300 COMP:250 CARG:1 CAND:13 VOTO:140 CAND:22 VOTO:90 BRAN:10 NULO:10 HASH:deadbeefcafebabe ASSI:0000000000000000000000000000000000000000000000000000000000000000"],
  },
];

function TestesPage() {
  const { user, loading } = useAuth();
  const validar = useServerFn(validarBU);
  const [qrText, setQrText] = useState("");
  const [modoTeste, setModoTeste] = useState(true);
  const [resultado, setResultado] = useState<any>(null);
  const [parseInfo, setParseInfo] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);

  function pushLog(level: TerminalLine["level"], text: string) {
    setTerminal((t) => [...t, { ts: Date.now(), level, text }]);
  }

  function carregarExemplo(qrs: string[], nome?: string) {
    setQrText(qrs.join("\n\n"));
    setResultado(null);
    setParseInfo(null);
    setTerminal([{ ts: Date.now(), level: "info", text: `Cenário carregado${nome ? ": " + nome : ""}` }]);
  }

  function inspecionar() {
    const lista = qrText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) { toast.error("Cole pelo menos um QR Code."); return; }
    pushLog("info", `Inspecionando ${lista.length} QR(s) localmente…`);
    const p = parseQRs(lista);
    setParseInfo(p);
    setResultado(null);
    if (p.erro) { pushLog("err", `parser: ${p.erro}`); toast.error(p.erro); }
    else {
      pushLog("ok", `parser ok · ${Object.keys(p.campos).length} campos · hash=${p.hash_final?.slice(0, 16)}…`);
      toast.success(`Parser ok — ${Object.keys(p.campos).length} campos extraídos.`);
    }
  }

  async function executar() {
    if (!user) { toast.error("Entre para executar testes contra o backend."); return; }
    const lista = qrText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) { toast.error("Cole ao menos um QR."); return; }
    setProcessing(true);
    pushLog("info", "Enviando ao servidor…");
    try {
      const r = await validar({ data: { qr_strings: lista, modo_teste: modoTeste } });
      setResultado(r);
      if (Array.isArray(r.etapas)) for (const e of r.etapas) setTerminal((t) => [...t, e]);
      if (r.sucesso) { pushLog("ok", "Pipeline completo."); toast.success("BU validado pelo backend."); }
      else { pushLog("err", `Rejeitado: ${r.codigo}`); toast.warning(`Rejeitado: ${r.codigo}`); }
    } catch (e: any) {
      pushLog("err", e.message);
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const vrch = parseInfo?.campos?.["VRCH"] as string | undefined;
  const uf = (parseInfo?.campos?.["UNFE"] as string | undefined)?.toUpperCase();
  const fase = parseInfo?.campos?.["FASE"] as string | undefined;
  const dtplAno = (() => {
    const d = parseInfo?.campos?.["DTPL"] as string | undefined;
    return d ? parseInt(d.substring(0, 4), 10) : null;
  })();
  const vrchAno = vrch?.match(/^(\d{4})/)?.[1] ? parseInt(vrch!.substring(0, 4), 10) : null;
  const vrchMismatch = vrchAno && dtplAno && vrchAno !== dtplAno;

  const [chaveInfo, setChaveInfo] = useState<any>(null);
  useEffect(() => {
    setChaveInfo(null);
    if (!vrch || !uf || !fase) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("chaves_tse")
        .select("versao_chave,sigla_uf,fase,tipo_eleicao,ano_eleicao,ativo,ultima_sincronizacao,valido_de,valido_ate")
        .eq("versao_chave", vrch).eq("sigla_uf", uf).eq("fase", fase).maybeSingle();
      if (!cancel) setChaveInfo(data ?? { _missing: true });
    })();
    return () => { cancel = true; };
  }, [vrch, uf, fase]);

  const podeExecutar = useMemo(() => {
    if (vrchMismatch) return false;
    if (modoTeste && vrchAno && vrchAno === 2026) return false;
    if (!modoTeste && vrchAno && vrchAno !== 2026) return false;
    return true;
  }, [vrchMismatch, modoTeste, vrchAno]);

  function limpar() {
    setQrText(""); setResultado(null); setParseInfo(null); setChaveInfo(null); setTerminal([]);
  }

  return (
    <AppShell testMode>
      <section className="border-b border-border px-4 py-6">
        <div className="mb-2 flex items-center gap-2">
          <FlaskConical className="size-4 text-warning" />
          <h2 className="text-mono-label">Laboratório de Testes</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Exercite o parser e a validação Ed25519 com BUs de teste sem afetar a totalização oficial.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to="/capturar" search={{ teste: "1" } as any} className="rounded-sm bg-primary p-3 text-center text-xs font-bold uppercase text-primary-foreground">
            Treinar com câmera
          </Link>
          <a href="https://dadosabertos.tse.jus.br/dataset/?groups=resultados" target="_blank" rel="noreferrer" className="rounded-sm border border-border p-3 text-center text-xs font-bold uppercase">
            BUs reais (Dados Abertos TSE) ↗
          </a>
        </div>

        <div className="mt-3 rounded-sm border border-warning/40 bg-warning/5 p-3 text-[11px] leading-relaxed">
          <p className="font-bold uppercase text-warning">Chaves Ed25519 mudam por eleição</p>
          <p className="mt-1 text-muted-foreground">
            Cada pleito tem chave própria — <code className="font-mono">VRCH</code> identifica a versão.
            Chaves <strong>2020/2022/2024</strong> só validam BUs do mesmo ano.
          </p>
        </div>
      </section>

      <BUsSalvos onLoad={(qrs, nome) => carregarExemplo(qrs, nome)} qrTextAtual={qrText} parseInfo={parseInfo} />

      <section className="border-b border-border px-4 py-6">
        <h3 className="text-mono-label mb-3">Cenários pré-carregados</h3>
        <div className="space-y-2">
          {EXEMPLOS.map((ex) => (
            <button key={ex.nome} onClick={() => carregarExemplo(ex.qrs, ex.nome)} className="flex w-full items-start justify-between gap-3 rounded-sm border border-border bg-card p-3 text-left hover:border-accent">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase">{ex.nome}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{ex.descricao}</p>
              </div>
              <span className="shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-mono text-[9px] font-bold">{ex.codigo_esperado}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-border px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-mono-label">Entrada</h3>
          {qrText && (
            <button onClick={limpar} className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
              <Trash2 className="size-3" /> Limpar
            </button>
          )}
        </div>
        <textarea value={qrText} onChange={(e) => setQrText(e.target.value)} rows={7} placeholder="Cole o conteúdo de cada QR Code, separado por linha em branco…" className="w-full rounded-sm border border-border bg-background p-3 font-mono text-[11px]" />

        <label className="mt-3 flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={modoTeste} onChange={(e) => setModoTeste(e.target.checked)} />
          <span>Marcar como <code className="font-mono">modo_teste</code> (aceita 2022/2024)</span>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={inspecionar} className="flex items-center justify-center gap-1 rounded-sm border border-border bg-background py-2 text-xs font-bold uppercase">
            <FileText className="size-3" /> Inspecionar
          </button>
          <button disabled={processing || loading || !podeExecutar} onClick={executar} className="rounded-sm bg-accent py-2 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50">
            {processing ? "Validando…" : "Validar no servidor"}
          </button>
        </div>
        {!podeExecutar && parseInfo && !parseInfo.erro && (
          <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[10px] text-destructive">
            Validação bloqueada: VRCH={vrch} (eleição {vrchAno}) {vrchMismatch ? `não bate com DTPL ${dtplAno}` : `incompatível com modo ${modoTeste ? "teste (2022/2024)" : "produção (2026)"}`}.
          </p>
        )}
        {!user && !loading && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            <Link to="/login" className="font-bold uppercase text-accent">Entre</Link> para executar a validação Ed25519.
          </p>
        )}
      </section>

      <section className="border-b border-border px-4 py-6">
        <h3 className="text-mono-label mb-3">Terminal de execução</h3>
        <BuTerminal lines={terminal} running={processing} title="BU · pipeline" />
      </section>

      {parseInfo && !parseInfo.erro && vrch && (
        <section className="border-b border-border px-4 py-6">
          <div className="mb-2 flex items-center gap-2">
            <KeyRound className="size-4 text-accent" />
            <h3 className="text-mono-label">Chave Ed25519 selecionada</h3>
          </div>
          <div className="space-y-2 text-[11px]">
            <Linha label="VRCH (BU)" valor={vrch} mono />
            <Linha label="Eleição (VRCH)" valor={vrchAno ? String(vrchAno) : "—"} />
            <Linha label="UF / Fase" valor={`${uf ?? "—"} · ${fase ?? "—"}`} />
            {chaveInfo === null && <p className="text-muted-foreground">Consultando…</p>}
            {chaveInfo?._missing && (
              <p className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-warning">
                Chave não encontrada para {vrch}/{uf}/{fase}. Importe no Admin.
              </p>
            )}
            {chaveInfo && !chaveInfo._missing && (
              <>
                <Linha label="Tipo" valor={`${chaveInfo.tipo_eleicao} · ano ${chaveInfo.ano_eleicao}`} />
                <Linha label="Validade" valor={`${chaveInfo.valido_de ?? "?"} → ${chaveInfo.valido_ate ?? "?"}`} />
                <Linha label="Última sync" valor={chaveInfo.ultima_sincronizacao ? new Date(chaveInfo.ultima_sincronizacao).toLocaleString("pt-BR") : "—"} />
                <Linha label="Status" valor={chaveInfo.ativo ? "ATIVA" : "INATIVA"} />
              </>
            )}
          </div>
        </section>
      )}

      {parseInfo && (
        <section className="border-b border-border px-4 py-6">
          <h3 className="text-mono-label mb-3">Diagnóstico do parser</h3>
          {parseInfo.erro ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <span className="font-bold uppercase text-destructive">Parse falhou</span>
              <p className="mt-1">{parseInfo.erro}</p>
            </div>
          ) : (
            <div className="space-y-3 text-[11px]">
              <Linha label="QR Codes" valor={`${parseInfo.qr_meta.length}`} />
              <Linha label="Hash final" valor={parseInfo.hash_final || "—"} mono />
              <Linha label="Assinatura" valor={parseInfo.assinatura ? `${parseInfo.assinatura.slice(0, 24)}…` : "(ausente)"} mono />
              <Linha label="Cargos extraídos" valor={`${parseInfo.votos.cargos.length}`} />
              <details className="rounded-sm border border-border bg-card p-2">
                <summary className="cursor-pointer text-[10px] font-bold uppercase">Campos do cabeçalho</summary>
                <pre className="mt-2 overflow-x-auto font-mono text-[10px]">{JSON.stringify(parseInfo.campos, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>
      )}

      {resultado && (
        <section className="border-b border-border px-4 py-6">
          <h3 className="text-mono-label mb-3">Resposta do servidor</h3>
          <div className={`rounded-sm border p-4 ${resultado.sucesso ? "border-success/30 bg-success/5" : resultado.codigo === "DUPLICADO" ? "border-warning/30 bg-warning/5" : "border-destructive/30 bg-destructive/5"}`}>
            <div className="flex items-center gap-2">
              {resultado.sucesso ? <CheckCircle2 className="size-5 text-success" /> : resultado.codigo === "DUPLICADO" ? <AlertTriangle className="size-5 text-warning" /> : <XCircle className="size-5 text-destructive" />}
              <span className="text-sm font-bold uppercase">{resultado.sucesso ? "Aceito" : resultado.codigo}</span>
            </div>
            {resultado.erro && <p className="mt-2 text-xs">{resultado.erro}</p>}
            {resultado.sucesso && <p className="mt-2 text-xs">Zona {resultado.zona} · Seção {resultado.secao} · {resultado.uf} · {resultado.cargos_apurados} cargos</p>}
          </div>
        </section>
      )}

      {resultado?.sucesso && <SimulacaoApuracao bu={resultado} />}

      <AnchorLab hashHex={parseInfo?.hash_final || resultado?.hash_final} onLog={pushLog} />
    </AppShell>
  );
}

function BUsSalvos({ onLoad, qrTextAtual, parseInfo }: { onLoad: (qrs: string[], nome: string) => void; qrTextAtual: string; parseInfo: any }) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function carregar() {
    if (!user) return;
    const { data } = await supabase.from("bus_teste_salvos").select("*").order("created_at", { ascending: false }).limit(50);
    setItems(data ?? []);
  }
  useEffect(() => { carregar(); }, [user?.id]);

  async function salvar() {
    if (!user) return toast.error("Entre primeiro.");
    if (!nome.trim()) return toast.error("Dê um nome ao BU.");
    const lista = qrTextAtual.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) return toast.error("Sem QRs para salvar.");
    setBusy(true);
    const { error } = await supabase.from("bus_teste_salvos").insert({
      user_id: user.id, nome: nome.trim(), qrs: lista,
      ano_eleicao: parseInfo?.campos?.DTPL ? parseInt(parseInfo.campos.DTPL.substring(0, 4), 10) : null,
      sigla_uf: parseInfo?.campos?.UNFE ?? null,
    } as any);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("BU de teste salvo."); setNome(""); carregar(); }
  }

  async function remover(id: string) {
    await supabase.from("bus_teste_salvos").delete().eq("id", id);
    carregar();
  }

  if (!user) return null;
  return (
    <section className="border-b border-border px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <FolderOpen className="size-4 text-accent" />
        <h3 className="text-mono-label">BUs de teste salvos</h3>
      </div>
      <div className="mb-3 flex gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do BU…" className="flex-1 rounded-sm border border-border bg-background p-2 text-xs" />
        <button onClick={salvar} disabled={busy} className="flex items-center gap-1 rounded-sm bg-secondary px-3 text-[10px] font-bold uppercase disabled:opacity-50">
          <Save className="size-3" /> Salvar atual
        </button>
      </div>
      <div className="space-y-1">
        {(items ?? []).length === 0 && <p className="text-center text-[10px] text-muted-foreground">Nenhum BU salvo ainda.</p>}
        {(items ?? []).map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-sm border border-border bg-card p-2 text-[11px]">
            <button onClick={() => onLoad(it.qrs as string[], it.nome)} className="flex-1 text-left">
              <p className="font-bold">{it.nome}</p>
              <p className="text-[9px] text-muted-foreground">{it.sigla_uf ?? "?"} · {it.ano_eleicao ?? "?"} · {(it.qrs as any[]).length} QRs</p>
            </button>
            <button onClick={() => remover(it.id)} className="text-destructive"><Trash2 className="size-3" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimulacaoApuracao({ bu }: { bu: any }) {
  const [totais, setTotais] = useState<any[] | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("totais_cargo")
        .select("cargo_codigo,candidato_numero,total_votos,total_bus_computados")
        .eq("ano_eleicao", bu.ano_eleicao).eq("sigla_uf", bu.uf).eq("modo_teste", true)
        .order("total_votos", { ascending: false }).limit(10);
      if (!cancel) setTotais(data ?? []);
    })();
    return () => { cancel = true; };
  }, [bu.bu_id]);
  return (
    <section className="border-b border-border bg-accent/5 px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <PlayCircle className="size-4 text-accent" />
        <h3 className="text-mono-label">Simulação · BU entrou na apuração</h3>
      </div>
      <div className="mb-3 rounded-sm border border-accent/30 bg-card p-3 text-[11px]">
        <p>BU <code className="font-mono">{bu.bu_id?.slice(0, 8)}…</code> agregado em <strong>{bu.uf}</strong>.</p>
        <p className="mt-1 text-muted-foreground">Trigger <code className="font-mono">agregar_totais_bu</code> somou os votos aos totais (modo teste — não afeta produção).</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link to="/resultados" className="inline-flex items-center gap-1 font-bold uppercase text-accent">
            Ver em /resultados <ExternalLink className="size-3" />
          </Link>
          <Link to="/mapa" search={{ teste: 1, ano: bu.ano_eleicao }} className="inline-flex items-center gap-1 font-bold uppercase text-accent">
            Ver no mapa (treinamento) <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Top 10 candidatos · {bu.uf}</p>
        {totais === null && <p className="text-[10px] text-muted-foreground">Carregando…</p>}
        {totais && totais.length === 0 && <p className="text-[10px] text-muted-foreground">Sem totais agregados ainda.</p>}
        {totais && totais.map((t, i) => (
          <div key={i} className="flex items-center justify-between border-b border-border py-1 text-[11px]">
            <span className="font-mono">cargo {t.cargo_codigo} · cand {t.candidato_numero}</span>
            <span className="font-bold">{t.total_votos.toLocaleString("pt-BR")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnchorLab({ hashHex, onLog }: { hashHex?: string; onLog: (l: TerminalLine["level"], t: string) => void }) {
  const [manual, setManual] = useState("");
  const target = (hashHex || manual).trim();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  async function runIpfs() {
    if (!target) return toast.error("Forneça um hash.");
    setBusy("ipfs");
    onLog("info", "IPFS · calculando CID determinístico…");
    try {
      const payload = JSON.stringify({ type: "bu-anchor-v1", hash: target, ts: Date.now() });
      const cid = computeIpfsCid(payload);
      onLog("ok", `IPFS · CID=${cid}`);
      setResults((r) => ({ ...r, ipfs: { cid, payload, gateways: IPFS_GATEWAYS.map((g) => ({ nome: g.nome, url: g.url(cid) })), verificado: null } }));
      toast.success("CID IPFS calculado.");
    } catch (e: any) { onLog("err", `IPFS: ${e.message}`); toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function verifyIpfs() {
    const cid = results.ipfs?.cid;
    if (!cid) return;
    setBusy("ipfs-v");
    onLog("info", "IPFS · consultando gateways públicos…");
    const r = await verifyIpfsCid(cid);
    setResults((s) => ({ ...s, ipfs: { ...s.ipfs, verificado: r } }));
    if (r.encontrado) { onLog("ok", `IPFS visível em ${r.encontrado.gateway}`); toast.success(`Encontrado em ${r.encontrado.gateway}.`); }
    else { onLog("warn", "IPFS não encontrado nos gateways (CID válido, conteúdo ainda não republicado)."); toast.warning("Não encontrado — republique o payload em algum nó IPFS."); }
    setBusy(null);
  }

  async function runNostr() {
    if (!target) return toast.error("Forneça um hash.");
    setBusy("nostr");
    onLog("info", "Nostr · publicando em relays…");
    try {
      const r = await publishNostrAnchor(target);
      setResults((s) => ({ ...s, nostr: r, nostrVerify: null }));
      onLog("ok", `Nostr · publicado em ${r.relays.length} relay(s) · id=${r.eventId.slice(0, 12)}…`);
      if (r.falhas.length) onLog("warn", `Nostr falhas: ${r.falhas.map(f => f.relay).join(", ")}`);
      toast.success(`Publicado em ${r.relays.length} relay(s).`);
    } catch (e: any) { onLog("err", `Nostr: ${e.message}`); toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function verifyNostr() {
    const id = results.nostr?.eventId;
    if (!id) return;
    setBusy("nostr-v");
    onLog("info", "Nostr · consultando nostr.band…");
    const r = await verifyNostrEvent(id);
    setResults((s) => ({ ...s, nostrVerify: r }));
    if (r.encontrado) { onLog("ok", `Nostr indexado em ${r.fonte}`); toast.success("Evento indexado."); }
    else { onLog("warn", "Nostr ainda não indexado."); toast.warning("Não indexado ainda — aguarde alguns segundos."); }
    setBusy(null);
  }

  async function runEvm() {
    if (!target) return toast.error("Forneça um hash.");
    setBusy("evm");
    onLog("info", "EVM · solicitando assinatura à carteira…");
    try {
      const r = await anchorHashEVM(target);
      setResults((s) => ({ ...s, evm: r }));
      onLog("ok", `EVM · tx=${r.txHash.slice(0, 18)}…`);
      toast.success("Hash ancorado em Sepolia.");
    } catch (e: any) { onLog("err", `EVM: ${e.message}`); toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <section className="border-t border-border px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <Anchor className="size-4 text-accent" />
        <h3 className="text-mono-label">Ancoragem descentralizada</h3>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Registra o hash SHA-512 do BU em IPFS, Nostr e EVM. Inclui gateways HTTP para verificação externa.
      </p>

      <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={hashHex ? `Hash inspecionado: ${hashHex.slice(0, 24)}…` : "Cole um hash hex"} className="mb-3 w-full rounded-sm border border-border bg-background p-2 font-mono text-[10px]" />

      <div className="space-y-3">
        {/* IPFS */}
        <div className="rounded-sm border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase">IPFS · CID determinístico</span>
            <button onClick={runIpfs} disabled={!!busy} className="rounded-sm bg-secondary px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-50">
              {busy === "ipfs" ? "…" : "Calcular CID"}
            </button>
          </div>
          {results.ipfs && (
            <div className="mt-2 space-y-2">
              <p className="break-all font-mono text-[10px] text-accent">{results.ipfs.cid}</p>
              <div className="grid grid-cols-2 gap-1">
                {results.ipfs.gateways.map((g: any) => (
                  <a key={g.nome} href={g.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-sm border border-border px-2 py-1 text-[10px] hover:border-accent">
                    {g.nome} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
              <button onClick={verifyIpfs} disabled={!!busy} className="flex w-full items-center justify-center gap-1 rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 text-[10px] font-bold uppercase text-accent disabled:opacity-50">
                <RefreshCw className="size-3" /> {busy === "ipfs-v" ? "Verificando…" : "Verificar nos gateways"}
              </button>
              {results.ipfs.verificado && (
                <div className="rounded-sm border border-border bg-background p-2 text-[10px]">
                  {results.ipfs.verificado.encontrado
                    ? <p className="text-success">✓ Visível em <strong>{results.ipfs.verificado.encontrado.gateway}</strong></p>
                    : <p className="text-warning">Não encontrado — CID válido mas conteúdo precisa ser republicado em algum nó IPFS.</p>}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">tentativas</summary>
                    <pre className="mt-1 font-mono text-[9px]">{JSON.stringify(results.ipfs.verificado.tentativas, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nostr */}
        <div className="rounded-sm border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase">Nostr · evento público</span>
            <button onClick={runNostr} disabled={!!busy} className="rounded-sm bg-secondary px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-50">
              {busy === "nostr" ? "publicando…" : "Publicar"}
            </button>
          </div>
          {results.nostr && (
            <div className="mt-2 space-y-2">
              <p className="break-all font-mono text-[10px] text-accent">{results.nostr.eventId}</p>
              <p className="text-[10px] text-muted-foreground">{results.nostr.relays.length} relay(s) confirmaram · {results.nostr.falhas.length} falhas</p>
              <div className="grid grid-cols-3 gap-1">
                {NOSTR_GATEWAYS.map((g) => (
                  <a key={g.nome} href={g.url(results.nostr.eventId)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-sm border border-border px-2 py-1 text-[10px] hover:border-accent">
                    {g.nome} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
              <button onClick={verifyNostr} disabled={!!busy} className="flex w-full items-center justify-center gap-1 rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 text-[10px] font-bold uppercase text-accent disabled:opacity-50">
                <RefreshCw className="size-3" /> {busy === "nostr-v" ? "Verificando…" : "Verificar via API nostr.band"}
              </button>
              {results.nostrVerify && (
                <p className={`text-[10px] ${results.nostrVerify.encontrado ? "text-success" : "text-warning"}`}>
                  {results.nostrVerify.encontrado ? `✓ Indexado em ${results.nostrVerify.fonte}` : "Ainda não indexado."}
                </p>
              )}
              {results.nostr.falhas.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[10px] text-muted-foreground">Relays que falharam</summary>
                  <pre className="mt-1 font-mono text-[9px]">{JSON.stringify(results.nostr.falhas, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* EVM */}
        <div className="rounded-sm border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase">EVM Sepolia (MetaMask)</span>
            <button onClick={runEvm} disabled={!!busy} className="rounded-sm bg-secondary px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-50">
              {busy === "evm" ? "assinando…" : "Ancorar"}
            </button>
          </div>
          {results.evm && (
            <a href={results.evm.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all font-mono text-[10px] text-accent">
              {results.evm.txHash} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function Linha({ label, valor, mono = false }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-1">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono break-all text-[10px]" : ""}`}>{valor}</span>
    </div>
  );
}
