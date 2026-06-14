import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { validarBU } from "@/lib/validar-bu.functions";
import { parseQRs } from "@/lib/bu-parser";
import { anchorHashEVM } from "@/lib/evm-anchor";
import { computeIpfsCid, publishNostrAnchor } from "@/lib/decentralized-anchor";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, AlertTriangle, FlaskConical, FileText, Trash2, Anchor, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/testes")({
  head: () => ({ meta: [{ title: "Laboratório de Testes · Totalização Paralela 2026" }] }),
  component: TestesPage,
});

/**
 * Conjuntos de QRs de exemplo para demonstração do parser.
 * Estes BUs NÃO têm assinaturas TSE válidas — servem para exercitar
 * o parser e mostrar os códigos de rejeição esperados.
 */
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
    qrs: [
      "QRBU:1:1 VRQR:1.0 VRCH:2024.1 DTPL:20241006 FASE:O UNFE:SP MUNI:71072 ZONA:001 SECA:0001 TURN:1 IDCA:TEST APTO:300 COMP:250 CARG:11 CAND:13 VOTO:120 CAND:22 VOTO:100 BRAN:15 NULO:15 HASH:abc123def456 ASSI:0000000000000000000000000000000000000000000000000000000000000000",
    ],
  },
  {
    nome: "BU 2026 sem chave TSE",
    descricao: "Estrutura válida, mas a chave pública VRCH ainda não foi importada.",
    codigo_esperado: "CHAVE_NAO_ENCONTRADA",
    qrs: [
      "QRBU:1:1 VRQR:1.0 VRCH:2026.1 DTPL:20261004 FASE:O UNFE:SP MUNI:71072 ZONA:001 SECA:0001 TURN:1 IDCA:TEST APTO:300 COMP:250 CARG:1 CAND:13 VOTO:140 CAND:22 VOTO:90 BRAN:10 NULO:10 HASH:deadbeefcafebabe ASSI:0000000000000000000000000000000000000000000000000000000000000000",
    ],
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

  function carregarExemplo(qrs: string[]) {
    setQrText(qrs.join("\n\n"));
    setResultado(null);
    setParseInfo(null);
  }

  function inspecionar() {
    const lista = qrText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) {
      toast.error("Cole pelo menos um QR Code (separado por linha em branco).");
      return;
    }
    const p = parseQRs(lista);
    setParseInfo(p);
    setResultado(null);
    if (p.erro) toast.error(p.erro);
    else toast.success(`Parser ok — ${Object.keys(p.campos).length} campos extraídos.`);
  }

  async function executar() {
    if (!user) {
      toast.error("Entre para executar testes contra o backend.");
      return;
    }
    const lista = qrText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) {
      toast.error("Cole ao menos um QR.");
      return;
    }
    setProcessing(true);
    try {
      const r = await validar({ data: { qr_strings: lista, modo_teste: modoTeste } });
      setResultado(r);
      if (r.sucesso) toast.success("BU validado pelo backend.");
      else toast.warning(`Rejeitado: ${r.codigo}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  // ── Seleção automática do conjunto de chaves Ed25519 (2024 vs 2026)
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
        .eq("versao_chave", vrch)
        .eq("sigla_uf", uf)
        .eq("fase", fase)
        .maybeSingle();
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
    setQrText("");
    setResultado(null);
    setParseInfo(null);
    setChaveInfo(null);
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
          Dados marcados <code className="font-mono">modo_teste = true</code>.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            to="/capturar"
            search={{ teste: "1" } as any}
            className="rounded-sm bg-primary p-3 text-center text-xs font-bold uppercase text-primary-foreground"
          >
            Treinar com câmera
          </Link>
          <a
            href="https://dadosabertos.tse.jus.br/dataset/?groups=resultados"
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-border p-3 text-center text-xs font-bold uppercase"
          >
            BUs reais (Dados Abertos TSE) ↗
          </a>
        </div>

        <div className="mt-3 rounded-sm border border-warning/40 bg-warning/5 p-3 text-[11px] leading-relaxed">
          <p className="font-bold uppercase text-warning">Chaves Ed25519 mudam por eleição</p>
          <p className="mt-1 text-muted-foreground">
            O TSE gera um novo par de chaves a cada pleito — a <code className="font-mono">VRCH</code> do BU
            identifica a versão. Chaves de <strong>2024</strong> (eleições municipais) <strong>não</strong> validam BUs
            de <strong>2026</strong> (eleições gerais). Importe as chaves 2026 no Admin assim que forem publicadas pelo TSE.
          </p>
        </div>
      </section>

      <section className="border-b border-border px-4 py-6">
        <h3 className="text-mono-label mb-3">1 · Cenários pré-carregados</h3>
        <div className="space-y-2">
          {EXEMPLOS.map((ex) => (
            <button
              key={ex.nome}
              onClick={() => carregarExemplo(ex.qrs)}
              className="flex w-full items-start justify-between gap-3 rounded-sm border border-border bg-card p-3 text-left hover:border-accent"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase">{ex.nome}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{ex.descricao}</p>
              </div>
              <span className="shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-mono text-[9px] font-bold">
                {ex.codigo_esperado}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-border px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-mono-label">2 · Entrada</h3>
          {qrText && (
            <button onClick={limpar} className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
              <Trash2 className="size-3" /> Limpar
            </button>
          )}
        </div>
        <textarea
          value={qrText}
          onChange={(e) => setQrText(e.target.value)}
          rows={7}
          placeholder="Cole o conteúdo de cada QR Code, separado por linha em branco…"
          className="w-full rounded-sm border border-border bg-background p-3 font-mono text-[11px]"
        />

        <label className="mt-3 flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={modoTeste} onChange={(e) => setModoTeste(e.target.checked)} />
          <span>Marcar como <code className="font-mono">modo_teste</code> (aceita 2022/2024)</span>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={inspecionar}
            className="flex items-center justify-center gap-1 rounded-sm border border-border bg-background py-2 text-xs font-bold uppercase"
          >
            <FileText className="size-3" /> Inspecionar
          </button>
          <button
            disabled={processing || loading}
            onClick={executar}
            className="rounded-sm bg-accent py-2 text-xs font-bold uppercase text-accent-foreground disabled:opacity-50"
          >
            {processing ? "Validando…" : "Validar no servidor"}
          </button>
        </div>
        {!user && !loading && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            <Link to="/login" className="font-bold uppercase text-accent">Entre</Link> para executar a validação Ed25519.
          </p>
        )}
      </section>

      {parseInfo && (
        <section className="border-b border-border px-4 py-6">
          <h3 className="text-mono-label mb-3">3 · Diagnóstico do parser</h3>
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
                <pre className="mt-2 overflow-x-auto font-mono text-[10px]">
                  {JSON.stringify(parseInfo.campos, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      )}

      {resultado && (
        <section className="px-4 py-6">
          <h3 className="text-mono-label mb-3">4 · Resposta do servidor</h3>
          <div
            className={`rounded-sm border p-4 ${
              resultado.sucesso
                ? "border-success/30 bg-success/5"
                : resultado.codigo === "DUPLICADO"
                ? "border-warning/30 bg-warning/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {resultado.sucesso ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : resultado.codigo === "DUPLICADO" ? (
                <AlertTriangle className="size-5 text-warning" />
              ) : (
                <XCircle className="size-5 text-destructive" />
              )}
              <span className="text-sm font-bold uppercase">
                {resultado.sucesso ? "Aceito" : resultado.codigo}
              </span>
            </div>
            {resultado.erro && <p className="mt-2 text-xs">{resultado.erro}</p>}
            {resultado.sucesso && (
              <p className="mt-2 text-xs">
                Zona {resultado.zona} · Seção {resultado.secao} · {resultado.uf} · {resultado.cargos_apurados} cargos
              </p>
            )}
            <pre className="mt-3 overflow-x-auto rounded-sm bg-background p-2 font-mono text-[10px]">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </div>
        </section>
      )}

      <AnchorLab hashHex={parseInfo?.hash_final || resultado?.hash_final} />
    </AppShell>
  );
}

function AnchorLab({ hashHex }: { hashHex?: string }) {
  const [manual, setManual] = useState("");
  const target = (hashHex || manual).trim();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  async function runIpfs() {
    if (!target) return toast.error("Forneça um hash (rode 'Inspecionar' antes ou cole abaixo).");
    setBusy("ipfs");
    try {
      const payload = JSON.stringify({ type: "bu-anchor-v1", hash: target, ts: Date.now() });
      const cid = computeIpfsCid(payload);
      setResults((r) => ({ ...r, ipfs: { cid, gateway: `https://ipfs.io/ipfs/${cid}`, payload } }));
      toast.success("CID IPFS calculado (determinístico).");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function runNostr() {
    if (!target) return toast.error("Forneça um hash.");
    setBusy("nostr");
    try {
      const r = await publishNostrAnchor(target);
      setResults((s) => ({ ...s, nostr: r }));
      toast.success(`Publicado em ${r.relays.length} relay(s) Nostr.`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function runEvm() {
    if (!target) return toast.error("Forneça um hash.");
    setBusy("evm");
    try {
      const r = await anchorHashEVM(target);
      setResults((s) => ({ ...s, evm: r }));
      toast.success("Hash ancorado em Sepolia.");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <section className="border-t border-border px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <Anchor className="size-4 text-accent" />
        <h3 className="text-mono-label">Ancoragem descentralizada (teste)</h3>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Registra o hash SHA-512 do BU em três camadas independentes — qualquer auditor
        pode reconstituir o hash a partir do BU e verificar a presença em cada uma.
      </p>

      <input
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        placeholder={hashHex ? `Usando hash inspecionado: ${hashHex.slice(0, 24)}…` : "Cole um hash hex (ou rode 'Inspecionar')"}
        className="mb-3 w-full rounded-sm border border-border bg-background p-2 font-mono text-[10px]"
      />

      <div className="grid grid-cols-1 gap-2">
        <button onClick={runIpfs} disabled={!!busy} className="rounded-sm border border-border bg-card p-3 text-left text-xs disabled:opacity-50">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase">IPFS · CID determinístico</span>
            <span className="text-[9px] text-muted-foreground">SHA-256 multihash</span>
          </div>
          {results.ipfs && (
            <p className="mt-2 break-all font-mono text-[10px] text-accent">{results.ipfs.cid}</p>
          )}
        </button>

        <button onClick={runNostr} disabled={!!busy} className="rounded-sm border border-border bg-card p-3 text-left text-xs disabled:opacity-50">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase">Nostr · evento público</span>
            <span className="text-[9px] text-muted-foreground">{busy === "nostr" ? "publicando…" : "relays.damus / nos.lol / nostr.band"}</span>
          </div>
          {results.nostr && (
            <a href={results.nostr.njumpUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all font-mono text-[10px] text-accent">
              {results.nostr.eventId} <ExternalLink className="size-3" />
            </a>
          )}
        </button>

        <button onClick={runEvm} disabled={!!busy} className="rounded-sm border border-accent/40 bg-accent/5 p-3 text-left text-xs disabled:opacity-50">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase">EVM Sepolia · carteira (MetaMask)</span>
            <span className="text-[9px] text-muted-foreground">{busy === "evm" ? "assinando…" : "testnet · grátis"}</span>
          </div>
          {results.evm && (
            <a href={results.evm.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all font-mono text-[10px] text-accent">
              {results.evm.txHash} <ExternalLink className="size-3" />
            </a>
          )}
        </button>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Para EVM mainnet real, troque de rede na sua carteira após apertar o botão — o custo será em ETH real.
      </p>
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
