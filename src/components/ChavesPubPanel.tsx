import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UFS } from "@/lib/cargos";
import { BuTerminal, type TerminalLine } from "@/components/BuTerminal";
import { uploadChavePub, buscarChavePubOficial } from "@/lib/tse-pub.functions";
import { Upload, Search, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

const ANOS = [2020, 2022, 2024, 2026];
const FASES = ["O", "S", "T"] as const;

type Estado = "pronta" | "pendente" | "ausente";

interface ChaveRow {
  id: number;
  ano_eleicao: number;
  sigla_uf: string;
  fase: string;
  tipo_eleicao: string;
  versao_chave: string;
  chave_publica_hex: string | null;
  hash_sha512_pub: string | null;
  ativo: boolean;
  arquivo_nome: string | null;
  ultima_sincronizacao: string | null;
}

function bytesToHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deriva ano/uf/fase de nomes como "ozzqrcode.pub" (fase+uf) */
function inferirDoNome(nome: string): { uf?: string; fase?: "O" | "S" | "T" } {
  const m = nome.toLowerCase().match(/^([ost])([a-z]{2})qrcode\.pub$/);
  if (!m) return {};
  return { fase: m[1].toUpperCase() as "O" | "S" | "T", uf: m[2].toUpperCase() };
}

export function ChavesPubPanel() {
  const qc = useQueryClient();
  const upload = useServerFn(uploadChavePub);
  const buscar = useServerFn(buscarChavePubOficial);
  const fileRef = useRef<HTMLInputElement>(null);

  const [ano, setAno] = useState(2022);
  const [tipo, setTipo] = useState<"LEGAL" | "COMUNITARIA">("LEGAL");
  const [uf, setUf] = useState<string>("ZZ");
  const [fase, setFase] = useState<"O" | "S" | "T">("O");
  const [forcar, setForcar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const log = (level: TerminalLine["level"], text: string) =>
    setTerminal((t) => [...t.slice(-200), { ts: Date.now(), level, text }]);

  const { data: chaves } = useQuery({
    queryKey: ["chaves-tse"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chaves_tse")
        .select("id, ano_eleicao, sigla_uf, fase, tipo_eleicao, versao_chave, chave_publica_hex, hash_sha512_pub, ativo, arquivo_nome, ultima_sincronizacao");
      return (data ?? []) as ChaveRow[];
    },
  });

  const mapa = useMemo(() => {
    const m = new Map<string, ChaveRow>();
    for (const c of chaves ?? []) m.set(`${c.ano_eleicao}|${c.sigla_uf}|${c.fase}|${c.tipo_eleicao}`, c);
    return m;
  }, [chaves]);

  function estado(a: number, u: string, f: string): { estado: Estado; row?: ChaveRow } {
    const row = mapa.get(`${a}|${u}|${f}|${tipo}`);
    if (!row) return { estado: "ausente" };
    if (row.chave_publica_hex) return { estado: "pronta", row };
    return { estado: "pendente", row };
  }

  const resumo = useMemo(() => {
    const r = { pronta: 0, pendente: 0, ausente: 0 };
    for (const u of UFS) for (const f of FASES.slice(0, 2)) r[estado(ano, u, f).estado]++;
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, ano, tipo]);

  async function enviarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const hex = bytesToHex(buf);
      const inf = inferirDoNome(file.name);
      const alvoUf = inf.uf ?? uf;
      const alvoFase = inf.fase ?? fase;
      log("info", `${file.name} · ${buf.byteLength} bytes · ${ano}/${alvoUf}/${alvoFase}`);
      if (buf.byteLength !== 32) {
        fail++;
        log("err", `${file.name}: ${buf.byteLength} bytes — um .pub Ed25519 tem exatamente 32.`);
        continue;
      }
      try {
        const r: any = await upload({
          data: {
            arquivo_nome: file.name,
            conteudo_hex: hex,
            ano_eleicao: ano,
            sigla_uf: alvoUf,
            fase: alvoFase,
            tipo_eleicao: tipo,
            forcar,
          },
        });
        if (r.sucesso) {
          ok++;
          log("ok", `${file.name}: SHA-512 ${r.conferido ? "confere com o hash oficial" : "gravado sem referência"} · ativada.`);
        } else {
          fail++;
          log("err", `${file.name}: ${r.erro}`);
          if (r.sha512_calculado) log("warn", `calculado=${r.sha512_calculado.slice(0, 32)}…`);
          if (r.sha512_esperado) log("warn", `esperado =${r.sha512_esperado.slice(0, 32)}…`);
        }
      } catch (e: any) {
        fail++;
        log("err", `${file.name}: ${e.message}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["chaves-tse"] });
    toast[fail && !ok ? "error" : "success"](`Upload: ${ok} ativada(s), ${fail} falha(s).`);
  }

  async function buscarOficial(todas: boolean) {
    setBusy(true);
    const alvos = todas ? UFS.map((u) => u as string) : [uf];
    let ok = 0;
    for (const u of alvos) {
      log("info", `GET .pub oficial ${ano}/${u}/${fase}…`);
      try {
        const r: any = await buscar({ data: { ano_eleicao: ano, sigla_uf: u, fase, tipo_eleicao: tipo } });
        if (r.sucesso) { ok++; log("ok", `${u}: baixada de ${r.url}`); }
        else {
          log("warn", `${u}: ${r.erro}`);
          for (const t of r.tentativas ?? []) log("info", `  ${t.resultado} ← ${t.url}`);
        }
      } catch (e: any) { log("err", `${u}: ${e.message}`); }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["chaves-tse"] });
    toast[ok ? "success" : "error"](`Busca oficial: ${ok}/${alvos.length} chave(s) obtida(s).`);
  }

  return (
    <section className="border-b border-border px-4 py-6">
      <h2 className="text-mono-label mb-3">Arquivos .pub &amp; Diagnóstico de Chaves</h2>

      {/* Filtros */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="rounded-sm border border-border bg-background p-2 text-xs">
          {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="rounded-sm border border-border bg-background p-2 text-xs">
          <option value="LEGAL">LEGAL</option>
          <option value="COMUNITARIA">COMUNIT.</option>
        </select>
        <select value={uf} onChange={(e) => setUf(e.target.value)} className="rounded-sm border border-border bg-background p-2 text-xs">
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={fase} onChange={(e) => setFase(e.target.value as any)} className="rounded-sm border border-border bg-background p-2 text-xs">
          {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Upload */}
      <div className="mb-3 rounded-sm border border-dashed border-border bg-card p-3">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Envie os arquivos <span className="font-mono">{"{o|s|t}{uf}qrcode.pub"}</span> (32 bytes). O SHA-512 é conferido contra o hash oficial cadastrado antes de ativar a chave.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pub,application/octet-stream"
          disabled={busy}
          onChange={(e) => enviarArquivos(e.target.files)}
          className="w-full text-[11px] file:mr-2 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:text-primary-foreground"
        />
        <label className="mt-2 flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
          <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
          Forçar gravação mesmo sem hash oficial de referência
        </label>
        <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
          <Upload className="size-3" /> Nome do arquivo define UF/fase automaticamente
        </div>
      </div>

      {/* Busca oficial */}
      <div className="mb-3 flex gap-2">
        <button disabled={busy} onClick={() => buscarOficial(false)} className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-accent px-3 py-2 text-[11px] font-bold uppercase text-accent-foreground disabled:opacity-50">
          <Search className="size-3" /> Buscar .pub ({uf})
        </button>
        <button disabled={busy} onClick={() => buscarOficial(true)} className="flex-1 rounded-sm border border-border px-3 py-2 text-[11px] font-bold uppercase disabled:opacity-50">
          Buscar todas UFs
        </button>
      </div>

      <BuTerminal lines={terminal} running={busy} title="chaves-pub" />

      {/* Diagnóstico */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-3 text-[10px] font-bold uppercase">
          <span className="flex items-center gap-1 text-success"><ShieldCheck className="size-3" /> Pronta {resumo.pronta}</span>
          <span className="flex items-center gap-1 text-warning"><ShieldAlert className="size-3" /> Pendente {resumo.pendente}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><ShieldX className="size-3" /> Ausente {resumo.ausente}</span>
        </div>
        <div className="overflow-hidden rounded-sm border border-border">
          <table className="w-full text-[10px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-1.5 text-left font-bold uppercase">UF</th>
                {FASES.slice(0, 2).map((f) => <th key={f} className="p-1.5 text-left font-bold uppercase">Fase {f}</th>)}
                <th className="p-1.5 text-left font-bold uppercase">VRCH</th>
              </tr>
            </thead>
            <tbody>
              {UFS.map((u) => {
                const o = estado(ano, u, "O");
                const s = estado(ano, u, "S");
                return (
                  <tr key={u} className="border-t border-border">
                    <td className="p-1.5 font-mono font-bold">{u}</td>
                    {[o, s].map((e, i) => (
                      <td key={i} className="p-1.5">
                        <span className={
                          e.estado === "pronta" ? "font-bold text-success"
                            : e.estado === "pendente" ? "font-bold text-warning"
                              : "text-muted-foreground/60"
                        }>
                          {e.estado === "pronta" ? "pronta (.pub)" : e.estado === "pendente" ? "pendente (hash)" : "ausente"}
                        </span>
                      </td>
                    ))}
                    <td className="p-1.5 font-mono text-muted-foreground">{o.row?.versao_chave ?? s.row?.versao_chave ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
