import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ShieldCheck, ShieldAlert, FlaskConical, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type BuResumo = {
  id: string;
  sigla_uf: string;
  municipio_num: number;
  municipio_nome: string | null;
  zona: number;
  secao: number;
  num_turno: number;
  fase: string;
  hash_final: string;
  versao_chave: string | null;
  assinatura_valida: boolean;
  status: string;
  modo_teste: boolean;
  created_at: string;
  eleitores_aptos: number | null;
  comparecimento: number | null;
};

interface Props {
  ano: number;
  turno: number | null;
  teste: boolean;
  uf?: string | null;
  municipio?: number | null;
}

/** Lista de boletins validados do recorte + painel de detalhes (hash, assinatura, modo_teste). */
export function BusPanel({ ano, turno, teste, uf = null, municipio = null }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: bus = [], isFetching } = useQuery({
    queryKey: ["bus-publicos", ano, turno, teste, uf, municipio],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("bus_publicos", {
        _ano: ano, _turno: turno, _teste: teste, _uf: uf, _mun: municipio,
      });
      return (data ?? []) as BuResumo[];
    },
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-mono-label">Boletins validados</h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {isFetching && bus.length === 0 ? "…" : `${bus.length} BU${bus.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {bus.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nenhum boletim validado neste recorte.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {bus.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => setAberto(b.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-tight">
                    {b.sigla_uf} · {b.municipio_nome ?? b.municipio_num} · Z{b.zona} S{b.secao}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {b.num_turno}º turno · {b.fase} · {b.hash_final.slice(0, 16)}…
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {b.modo_teste && <FlaskConical className="size-3.5 text-warning" />}
                  {b.assinatura_valida
                    ? <ShieldCheck className="size-4 text-accent" />
                    : <ShieldAlert className="size-4 text-destructive" />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {aberto && <BuDetalhe id={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

type BuDetalheRow = BuResumo & {
  ano_eleicao: number;
  assinatura: string;
  eleitores_faltosos: number | null;
  votos: Record<string, unknown> | null;
  blockchain_tx: string | null;
  blockchain_explorer_url: string | null;
  id_carga: string | null;
  versao_software: string | null;
};

function BuDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bu-detalhe", id],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("bu_publico_detalhe", { _id: id });
      return ((data ?? [])[0] ?? null) as BuDetalheRow | null;
    },
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
      <div
        className="relative max-h-[85vh] w-full max-w-[440px] overflow-y-auto border-t border-border bg-background p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <span className="text-mono-label">Detalhes do BU</span>
          <button onClick={onClose} aria-label="Fechar"><X className="size-4" /></button>
        </header>

        {isLoading || !data ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {isLoading ? "Carregando…" : "Boletim não encontrado."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Tag ok={data.assinatura_valida}>
                {data.assinatura_valida ? "Assinatura Ed25519 válida" : "Assinatura inválida"}
              </Tag>
              <Tag ok>{data.status}</Tag>
              {data.modo_teste && <Tag warn>modo_teste</Tag>}
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <Campo k="Eleição" v={`${data.ano_eleicao} · ${data.num_turno}º turno`} />
              <Campo k="Fase" v={data.fase} />
              <Campo k="UF / Município" v={`${data.sigla_uf} · ${data.municipio_nome ?? data.municipio_num}`} />
              <Campo k="Zona / Seção" v={`${data.zona} / ${data.secao}`} />
              <Campo k="Aptos" v={data.eleitores_aptos ?? "—"} />
              <Campo k="Comparecimento" v={data.comparecimento ?? "—"} />
              <Campo k="Faltosos" v={data.eleitores_faltosos ?? "—"} />
              <Campo k="Versão da chave" v={data.versao_chave ?? "—"} />
              <Campo k="Carga" v={data.id_carga ?? "—"} />
              <Campo k="Software urna" v={data.versao_software ?? "—"} />
            </dl>

            <Bloco titulo="Hash final (SHA-512)" valor={data.hash_final} />
            <Bloco titulo="Assinatura" valor={data.assinatura} />

            {data.blockchain_explorer_url && (
              <a
                href={data.blockchain_explorer_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-bold uppercase"
              >
                <Link2 className="size-3.5" /> Ver ancoragem em blockchain
              </a>
            )}

            <p className="font-mono text-[9px] text-muted-foreground">
              registrado em {new Date(data.created_at).toLocaleString("pt-BR")} · id {data.id}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ children, ok, warn }: { children: React.ReactNode; ok?: boolean; warn?: boolean }) {
  const cls = warn
    ? "border-warning text-warning bg-warning/10"
    : ok
      ? "border-accent text-accent bg-accent/10"
      : "border-destructive text-destructive bg-destructive/10";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

function Campo({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-card px-2 py-1.5">
      <dt className="text-[9px] uppercase text-muted-foreground">{k}</dt>
      <dd className="font-mono text-xs font-bold">{v}</dd>
    </div>
  );
}

function Bloco({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-2">
      <p className="text-[9px] uppercase text-muted-foreground">{titulo}</p>
      <p className="mt-1 break-all font-mono text-[10px] leading-relaxed">{valor}</p>
    </div>
  );
}
