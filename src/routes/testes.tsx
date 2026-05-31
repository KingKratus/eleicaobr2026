import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/testes")({
  head: () => ({ meta: [{ title: "Modo de Treinamento · Totalização Paralela 2026" }] }),
  component: TestesPage,
});

function TestesPage() {
  return (
    <AppShell testMode>
      <section className="px-4 py-6 space-y-4">
        <h2 className="text-mono-label">Modo de Treinamento</h2>
        <p className="text-sm">
          Aqui você pode praticar a captura usando BUs reais das eleições de 2022 e 2024.
          Dados enviados nesta aba <strong>não contam</strong> para os resultados oficiais de 2026.
        </p>

        <Link to="/capturar" search={{ teste: true } as any} className="block rounded-sm bg-primary p-4 text-center text-sm font-bold uppercase text-primary-foreground">
          Iniciar treinamento
        </Link>

        <div className="rounded-sm border border-border bg-card p-4 text-xs space-y-2">
          <h3 className="font-bold">Como funciona</h3>
          <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Aceita apenas BUs com data dos pleitos de 2022 ou 2024</li>
            <li>Aceita fases Oficial, Simulado e Treinamento</li>
            <li>Mesma validação Ed25519 dos BUs reais</li>
            <li>Dados marcados com flag <code className="font-mono">modo_teste</code></li>
          </ol>
        </div>
      </section>
    </AppShell>
  );
}
