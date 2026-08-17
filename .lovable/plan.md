# Revalidação periódica + aprovação manual de chaves TSE

## O que os arquivos enviados contêm

Os quatro anexos (2022 e 2024, em .txt e .zip) trazem **apenas as listas de hashes SHA-512** dos arquivos `.pub` — não os arquivos `.pub` em si.

Comparei linha a linha com o banco: **140 de 140 hashes já estão gravados e idênticos** (2022 fases O/S, 2024 fases O/S/T, 28 UFs cada). Nada ficou pendente do lado dos hashes.

O que continua faltando são os binários `.pub` de 32 bytes: hoje só 10 registros (2022, fase O) têm chave pública gravada; os outros 131 estão "pendente (só hash)". Esses arquivos só entram por upload ou pela URL oficial do TSE.

## O que será construído

### 1. Fila de aprovação manual

Nenhuma chave passa a valer automaticamente. Todo `.pub` — vindo de upload ou baixado da URL do TSE — entra numa fila de revisão com:

- SHA-512 calculado do arquivo
- SHA-512 oficial cadastrado e o veredito da conferência (confere / diverge / sem referência)
- origem (upload manual com nome do arquivo, ou URL do TSE usada)
- quem enviou e quando

Na tela do admin, cada item da fila tem **Aprovar** ou **Rejeitar** (com motivo). Só ao aprovar a chave é gravada em `chaves_tse` e ativada. Itens com SHA divergente ficam bloqueados para aprovação.

### 2. Revalidação periódica

Rotina diária que, para cada chave já ativa:

- recalcula o SHA-512 da chave gravada e compara com o hash oficial;
- quando o servidor do TSE responde, rebaixa o `.pub` e compara byte a byte com o que está no banco.

Resultados possíveis: `ok`, `divergente`, `indisponivel`. Divergências marcam a chave como suspeita (deixa de ser usada na validação de BUs até revisão) e viram um registro no histórico de revalidação.

### 3. Painel

No `/admin`, junto ao painel de chaves:

- aba **Fila de aprovação** com contador de itens pendentes;
- coluna de saúde no diagnóstico por UF: última revalidação, resultado e alerta vermelho para divergência;
- botão "Revalidar agora" com log no terminal já existente.

## Detalhes técnicos

- Migração: tabela `chaves_pub_pendentes` (id, ano, uf, fase, tipo, conteudo_hex, sha512_calculado, sha512_esperado, confere, origem, url_origem, arquivo_nome, enviado_por, status pendente/aprovada/rejeitada, motivo, timestamps) e tabela `chaves_revalidacao` (chave_id, executado_em, resultado, detalhe). Em `chaves_tse`: `ultima_revalidacao`, `resultado_revalidacao`, `suspeita boolean default false`. GRANTs + RLS: leitura/escrita só para admin/moderador via `has_role`; `service_role` para a rotina.
- `src/lib/tse-pub.functions.ts`: `uploadChavePub` e `buscarChavePubOficial` passam a inserir na fila em vez de ativar. Novas funções `listarChavesPendentes`, `aprovarChavePendente`, `rejeitarChavePendente` (todas com `requireSupabaseAuth` + checagem de papel), e `revalidarChaves` para o disparo manual.
- Nova rota `src/routes/api/public/hooks/revalidar-chaves.ts` (POST, protegida por segredo no header) executando a varredura; agendada por `pg_cron` uma vez por dia.
- `src/lib/validar-bu.functions.ts`: ignora chaves com `suspeita = true`, retornando código `CHAVE_SUSPEITA`.
- `src/components/ChavesPubPanel.tsx`: fila de aprovação, coluna de saúde e botão de revalidação.
