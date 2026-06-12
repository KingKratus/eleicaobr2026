import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre · Totalização Paralela 2026" },
      { name: "description", content: "Metodologia da totalização paralela cidadã: parser do QR Code do BU, verificação Ed25519, cadeia de hashes SHA-512." },
      { property: "og:title", content: "Sobre · Totalização Paralela 2026" },
      { property: "og:description", content: "Como validamos cada Boletim de Urna antes de agregar." },
    ],
  }),
  component: SobrePage,
});

function SobrePage() {
  return (
    <AppShell>
      <article className="prose prose-invert px-4 py-6 text-sm leading-relaxed">
        <h1 className="mb-2 text-xl font-extrabold uppercase tracking-tighter">Metodologia</h1>
        <p className="text-muted-foreground">
          Totalização Paralela Cidadã é um app PWA aberto para fiscalização das Eleições Gerais 2026.
          Voluntários escaneiam o QR Code do Boletim de Urna; o servidor verifica a assinatura digital
          oficial do TSE antes de agregar.
        </p>

        <h2 className="mt-6 text-mono-label">1. Parser do QR Code</h2>
        <p>
          Seguimos o <strong>Manual TSE — QR Code no BU (2024)</strong>, válido para 2026:
          cabeçalho <code>QRBU:n:x VRQR:y.z VRCH:vvv</code>, conteúdo com blocos
          <code> CARG </code> / <code>PART</code> e tokens bare <code>nnnnn:nnnn</code> para candidatos.
        </p>

        <h2 className="mt-6 text-mono-label">2. Cadeia de hashes (§6.1)</h2>
        <p>
          Cada QR carrega <code>HASH:</code> SHA-512 cumulativo. Recomputamos a cadeia inteira;
          rejeição com código <code>HASH_INVALIDO</code> se qualquer fragmento for adulterado ou estiver fora de ordem.
        </p>

        <h2 className="mt-6 text-mono-label">3. Assinatura Ed25519 (§6)</h2>
        <p>
          O último QR contém <code>ASSI:</code> — assinatura EdDSA sobre o hash final.
          Verificamos com a chave pública oficial baixada de
          <code> qrcodenobu.tse.jus.br</code> (32 bytes, indexada por <code>VRCH/UF/tipo/fase</code>).
        </p>

        <h2 className="mt-6 text-mono-label">4. Regras de aceitação</h2>
        <ul>
          <li>Produção: ano 2026 e fase <code>O</code> (Oficial)</li>
          <li>Sandbox: ano 2022 ou 2024, qualquer fase — marcado <em>TESTE</em>, não conta para totais</li>
          <li>Duplicatas (mesma seção/turno) rejeitadas</li>
        </ul>

        <h2 className="mt-6 text-mono-label">5. Registro público opcional</h2>
        <p>
          O voluntário pode opcionalmente ancorar o hash do BU em blockchain EVM (Sepolia testnet) via MetaMask,
          gerando um link verificável publicamente.
        </p>

        <h2 className="mt-6 text-mono-label">6. Auditor IA</h2>
        <p>
          Moderadores podem rodar um auditor IA (NVIDIA Build, modelo Llama-3.3-70B) que cruza
          o BU com agregados vizinhos para sinalizar anomalias.
        </p>

        <h2 className="mt-6 text-mono-label">Fontes</h2>
        <ul>
          <li><a href="http://qrcodenobu.tse.jus.br/tse.qrcodebu/" target="_blank" rel="noreferrer">Chaves públicas TSE</a></li>
          <li><a href="https://ed25519.cr.yp.to/" target="_blank" rel="noreferrer">Ed25519 spec</a></li>
          <li><a href="https://github.com/paulmillr/noble-ed25519" target="_blank" rel="noreferrer">Noble Ed25519 (JS)</a></li>
        </ul>

        <div className="mt-8 flex gap-2">
          <Link to="/testes" className="rounded-sm bg-primary px-4 py-2 text-xs font-bold uppercase text-primary-foreground">Lab de Testes</Link>
          <Link to="/" className="rounded-sm border border-border px-4 py-2 text-xs font-bold uppercase">Painel</Link>
        </div>
      </article>
    </AppShell>
  );
}
