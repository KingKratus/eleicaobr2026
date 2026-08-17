# Corrigir gravação de BU: `versao_chave` nulo

## O problema

O BU do Paraná (2022) passa por todas as etapas — cadeia SHA-512 íntegra, chave encontrada, assinatura Ed25519 válida — e falha só na gravação:

```text
INSERT falhou: null value in column "versao_chave" ... violates not-null constraint
```

Causa confirmada no parser (`src/lib/bu-parser.ts`): antes de extrair os campos, o cabeçalho `QRBU:1:1 VRQR:1.5 VRCH:20220829` é removido de cada QR (correto, porque o cabeçalho não entra no conteúdo que é hasheado). Só que a extração de campos roda sobre o texto já sem cabeçalho — então `VRCH`, `VRQR` e `QRBU` nunca chegam ao objeto de campos. Daí o log "VRCH=undefined" e o `versao_chave` nulo no insert. Isso afeta **todo e qualquer BU**, de qualquer UF ou ano, não só o do PR.

## O que fazer

1. **Parser** — extrair os campos do cabeçalho do QR original (antes do corte), mesclando `QRBU`, `VRQR` e `VRCH` no mapa de campos, sem alterar em nada o texto usado no cálculo dos hashes nem a cadeia cumulativa. A verificação criptográfica continua idêntica.
2. **Validação** — em `src/lib/validar-bu.functions.ts`, usar um valor de fallback para `versao_chave` (a versão registrada da chave TSE encontrada, ou o ano do BU) caso o QR realmente não traga `VRCH`, para que nenhum BU válido seja perdido por um campo ausente. Registrar no terminal o VRCH efetivamente usado.
3. **Lab de testes** — com o `VRCH` voltando a aparecer, o bloqueio de validação cruzada (VRCH x DTPL x modo teste) volta a funcionar como projetado; conferir que o BU 2022 em modo teste continua liberado e que um BU 2026 em modo teste segue bloqueado.

## Verificação

- Rodar o BU do PR (2022, zona 42, seção 33) pelo Lab de Testes: deve gravar com sucesso, com `versao_chave = 20220829`.
- Repetir com BUs de outras UFs/fases para confirmar que o caminho é genérico (a correção é no parser, então vale para todos os estados).
- Conferir no banco que a linha gravada tem UF, zona, seção, turno e votos coerentes, e que os totais agregados pela trigger aparecem na apuração.
