## Escopo

Vou tratar tudo do pedido em um único ciclo, dividido por área. Nada destrutivo nos dados existentes.

---

### 1. Chaves TSE 2020/2022/2024/2026 — sincronização & UI

**Bug atual:** o cron diário só varre 2024/ano-atual/próximo. 2020 e 2022 nunca entram. Além disso a UI do admin só permite digitar um VRCH por vez.

- Estender `src/routes/api/public/hooks/sync-chaves-tse.ts` para varrer também 2020 e 2022 (lista fixa de VRCHs conhecidos + heurística por ano), gravando `ano_eleicao` correto.
- Adicionar botão **"Buscar chaves 2020/2022/2024/2026 do TSE"** no painel admin (`src/routes/admin.tsx`) que dispara `fetch('/api/public/hooks/sync-chaves-tse', { method: 'POST' })` e mostra contagem por ano.
- Manter o formulário manual existente (VRCH + UF + lote).
- Mostrar agrupamento por ano no listão de chaves.

### 2. Painel de moderação — bugs

- Verificar carregamento dos BUs (a policy RLS já cobre admin; o sintoma "não funciona" vem do botão Auditor IA só aparecer quando `status === 'validado'` e de erros silenciosos). Adicionar:
  - Estado vazio explícito ("Nenhum BU recebido ainda").
  - Filtro por status (todos/pendente/validado/rejeitado).
  - Botões **aprovar/rejeitar manualmente** (chama UPDATE via supabase) — usa policy `Moderador/admin pode atualizar status` que já existe.
  - Toast de erro real em vez de falha silenciosa.
- Confirmar que o gate de acesso já inclui admin (já inclui — `r.role === 'moderador' || 'admin'`); manter.

### 3. Modo teste — simulação até a interface de apuração

- Em `src/routes/testes.tsx`, adicionar seção **"5 · Simulação de fluxo"** que após um BU teste ser validado mostra:
  - Mini-painel "Entrando na apuração" com animação dos votos somando aos totais de teste (consulta `totais_cargo` filtrando `modo_teste`/visualização local).
  - Link "Ver em /resultados (modo teste)" preservando a flag.
- Permitir **salvar BUs de teste reutilizáveis**: nova tabela `bus_teste_salvos` (admin-only RLS) e botão "Salvar este BU" + dropdown "Carregar BU salvo" no Lab.

### 4. Ancoragem descentralizada — gateways de verificação

- **IPFS:** após calcular o CID, mostrar 3 gateways clicáveis para verificação real:
  - `https://ipfs.io/ipfs/{cid}`, `https://cloudflare-ipfs.com/ipfs/{cid}`, `https://w3s.link/ipfs/{cid}`
  - Adicionar botão **"Publicar no IPFS (web3.storage)"** opcional via API pública (`https://api.web3.storage`) — exige token do usuário, com fallback explicando que o CID determinístico já permite verificação se o conteúdo for republicado.
- **Nostr (bug real):** o `Relay.connect` de `nostr-tools` falha em vários browsers por causa de WebSocket sync e o `Promise.all` engole erros. Corrigir:
  - Aumentar timeout, aguardar `relay.publish()` de fato (Promise que resolve quando o relay confirma), capturar erros individuais e devolver para a UI.
  - Adicionar relays adicionais (`wss://relay.primal.net`, `wss://nostr.wine`).
  - Mostrar links de verificação em múltiplos gateways: `njump.me`, `nostr.com/e/`, `primal.net/e/`.
  - Adicionar gateway HTTP de leitura (`https://api.nostr.band/v0/event/{id}`) com botão "Verificar agora".

### 5. Documentação de API no admin (export PDF/CSV)

Nova aba **"API"** no admin (`src/routes/admin.tsx` com seção colapsável ou nova rota `/admin/api`):
- Lista de endpoints documentados (path, método, auth, payload, response):
  - `POST /api/public/hooks/sync-chaves-tse` — sincroniza chaves
  - Server functions: `validarBU`, `importarChaveTSE`, `auditarBU`
  - Endpoints REST sugeridos novos (criar): `GET /api/public/v1/totais`, `GET /api/public/v1/cobertura`, `GET /api/public/v1/boletins/:id` (read-only, sem PII)
- Botões **Exportar PDF** (via `jspdf`) e **Exportar CSV** da spec.

### 6. Terminal de execução do BU

Componente `<BuTerminal>` no Lab e na captura: painel preto estilo console que mostra em tempo real as etapas:
```
> parseQRs ... OK (3 QRs, 12 cargos)
> validar chave VRCH=2026.1/SP/O ... OK
> verificar assinatura Ed25519 ... OK
> calcular hash SHA-512 ... OK (abc123...)
> inserir em boletins ... OK (id=...)
> agregar totais ... OK
```
Implementar como log push (`useState<string[]>`) alimentado pelas etapas reais de `validarBU` (devolver `etapas[]` no resultado) + ancoragem.

### 7. Bugs adicionais

- **Mapa Leaflet crash (`_leaflet_pos`)**: ocorre por re-mount durante navegação. Adicionar `key` estável e cleanup no `useEffect` do `BrazilMap.tsx`.
- Garantir que o `sync-chaves-tse` lida com 404 silencioso (não polui a UI).

---

## Detalhamento técnico

- Migração nova: `bus_teste_salvos` (id, user_id, nome, qrs jsonb, created_at) + RLS admin-only + GRANTs.
- Nenhuma alteração em policies existentes.
- Sem novos secrets obrigatórios.
- Sem alteração de auth ou estrutura de rotas autenticadas.

## Arquivos afetados

- `src/routes/admin.tsx` (chaves multi-ano, moderação melhorada, API docs, exports)
- `src/routes/testes.tsx` (simulação, BUs salvos, terminal, gateways)
- `src/routes/api/public/hooks/sync-chaves-tse.ts` (2020/2022)
- `src/routes/api/public/v1/*.ts` (novos endpoints read-only)
- `src/lib/decentralized-anchor.ts` (Nostr robusto + IPFS gateways)
- `src/components/BuTerminal.tsx` (novo)
- `src/components/BrazilMap.tsx` (fix re-mount)
- `src/lib/validar-bu.functions.ts` (devolver `etapas[]`)
- Migração SQL: tabela `bus_teste_salvos`.
- Deps: `jspdf` para export PDF.
