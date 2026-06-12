# Próximos passos — Totalização Paralela 2026

Plano baseado na comparação direta entre o **Manual TSE — QR Code no BU (2024)** e o código já implementado.

---

## Divergências encontradas no código atual


| #   | Manual (seções 4.2 / 4.3 / 6)                                                                                                                      | Código atual                                                                                            | Risco                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Candidatos aparecem como tokens bare `nnnnn:nnnn` (ex.: `91001:1`, `92:1`), dentro de blocos `CARG:` e opcionalmente `PART:`                       | `extrairVotos` em `bu-parser.ts` procura `CAND:` e `VOTO:` — **tokens que não existem no formato real** | Totais sempre zerados — `totais_cargo` nunca recebe votos reais |
| 2   | HASH de cada QR é **cumulativo**: `hashₙ = SHA-512(conteúdoₙ₋₁ + dadosₙ)` e permite verificar leitura em sequência                                 | Cadeia de hashes não é recomputada/validada; só o hash final entra na assinatura                        | Fragmentos forjados/embaralhados passam                         |
| 3   | Chaves públicas oficiais ficam em `http://qrcodenobu.tse.jus.br/tse.qrcodebu/{VRCH}/{LEGAL|COMUNITARIA}/{O|S}{uf}qrcode.pub` (binário de 32 bytes) | Admin só permite digitação manual (64 hex) — sem fetch oficial                                          | Cadastro lento e propenso a erro de digitação                   |
| 4   | Reconstrução para hash/assinatura exige **reinserir o espaço em branco** removido na quebra entre QRs (§4)                                         | Junção simples com `" "` entre QRs                                                                      | Casos de BU multi-QR podem falhar na verificação                |
| 5   | Códigos de cargo: 1, 3, 5, 6, 7, 8, 9, 11, 13                                                                                                      | Verificar `src/lib/cargos.ts`                                                                           | Possível inconsistência                                         |


---

## Escopo desta etapa

### 1. Reescrever `extrairVotos` conforme §4.2 do manual

- Tokenizar o conteúdo respeitando os blocos: `CARG → TIPO → VERC → (PART → LEGP → TOTP)* → (nnnnn:nnnn)* → APTA APTS APTT [CSEC] NOMI [LEGC] BRAN NULO TOTC`.
- Candidatos: qualquer token `^\d+:\d+$` dentro de um cargo (entre `CARG:` atual e o próximo `CARG:` ou EOF), excluindo chaves conhecidas (`APTA`, `NOMI`, etc.).
- Persistir também: `tipo` (0/1/2), `legenda`, `nominais`, `aptos`, `comparecimento_cargo`.
- Atualizar trigger `agregar_totais_bu` se necessário (o shape JSON muda).

### 2. Validar cadeia de hashes (§4.3 + §6.1)

- Para cada QR `i`, recomputar `SHA-512(conteúdo_acumulado_até_i)` em hex e comparar com `HASH:` do QR.
- Em caso de divergência, rejeitar com código novo `HASH_INVALIDO`.
- Tratar o detalhe do espaço em branco da quebra (reinserir antes do hash).

### 3. Fetch oficial de chaves TSE no Admin

- Novo `createServerFn` `importarChaveTSE({ versao_chave, uf, tipo_eleicao, fase })`:
  - Monta URL `http://qrcodenobu.tse.jus.br/tse.qrcodebu/{VRCH}/{LEGAL|COMUNITARIA}/{fase}{uf_min}qrcode.pub`.
  - Faz `fetch`, lê `ArrayBuffer`, verifica 32 bytes, converte para hex.
  - Upsert em `chaves_tse`.
- Admin ganha botão "Baixar do TSE" (preenche por UF + versão + tipo + fase) e "Importar todas (BR + 27 UFs)" em lote.
- Mantém o formulário manual como fallback.

### 4. Página `/sobre` — metodologia para auditores

- Explica: parser, verificação Ed25519, regras de aceitação (ano 2026, fase O), modo teste (2022/2024), agregação, limites.
- Links: manual TSE, código fonte, FAQ.
- SEO próprio (title, description, OG).

### 5. Auditor AI com NVIDIA Build (OpenAI-compatible + tool calling)

- Endpoint `https://integrate.api.nvidia.com/v1` via `@ai-sdk/openai-compatible`.
- Modelo default: `meta/llama-3.3-70b-instruct` (override por env).
- `createServerFn` `auditarBU({ bu_id })` protegido por `requireSupabaseAuth` + checagem `has_role('auditor'|'admin')`:
  - Carrega o BU + agregados da seção/zona.
  - AI SDK `streamText` com `stopWhen: stepCountIs(50)` e tools:
    - `getTotaisSecao(zona, secao)`, `getCoberturaUF(uf)`, `getCargo(codigo)`, `compararSecoesVizinhas(...)`.
  - Devolve resumo + apontamentos (votos negativos, totais inconsistentes, candidatos fora do pleito).
- UI: aba "Auditor IA" no `/admin` (apenas role admin/auditor), abre painel com streaming.
- Chave armazenada em **secret server-side** `NVIDIA_API_KEY` (nunca em `VITE_`).

### 6. Refinos do Lab de Testes

- Adicionar o BU exemplo "pequeno" do manual (página 18) com VRCH `20240507` como cenário pré-cadastrado.
- Botão "Importar chave deste exemplo" que chama o fetch oficial e roda end-to-end (assinatura real válida).

---

## Detalhes técnicos

- **Parser** em `src/lib/bu-parser.ts` ganha uma máquina de estados (state machine) com testes unitários (`bun test`) usando os 2 BUs do manual.
- **Hash cumulativo**: usar `sha512` já importado de `@noble/hashes/sha2`.
- **Fetch TSE**: dentro de `.handler()` (Worker tem `fetch`); responde plain DTO. Endpoint TSE é HTTP — ok no Worker.
- **AI SDK**: provider helper em `src/lib/nvidia-gateway.server.ts`, lendo `process.env.NVIDIA_API_KEY` dentro do handler.
- **Tools** com `tool({ inputSchema: z.object(...), execute })`. `stepCountIs(50)`.
- **Server-only**: `*.server.ts` para o provider; `auditar.functions.ts` em `src/lib/`.
- **Migration**: provável atualização da coluna `votos` (mesmo shape, só campos adicionais — JSONB acomoda) e talvez novo `app_role` `'auditor'`. Migração separada após aprovação.

---

## Pré-requisito

Para a etapa 5, preciso que você adicione o secret `**NVIDIA_API_KEY**` (sua chave do NVIDIA Build / `build.nvidia.com`). Vou pedir via `add_secret` ao iniciar a implementação. Sem ela, faço apenas etapas 1–4 + 6.

## Ordem de execução

1. Parser de votos + testes (etapa 1)
2. Validação de cadeia de hashes (etapa 2)
3. Fetch oficial de chaves no Admin (etapa 3)
4. Página `/sobre` (etapa 4)
5. Refinos do Lab de Testes (etapa 6)
6. Auditor IA NVIDIA (etapa 5) — depende da chave

Confirma para eu seguir?

&nbsp;

Menu de pizza para todos as abas (admin só aparece pra quem é admin)

Peça minha API de IA do Nvidia Build pra usar agentes de IA pra verificar o BOLETIM DE URNA também. 

Verifique logs de erro. Faça testes em todo código também. Otimize memória. 

Permita registro IPFS/ blockchain EVM até as de teste do lado do usuário (após isso o site vai mostrar o link) 