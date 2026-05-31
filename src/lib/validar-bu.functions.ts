import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { parseQRs, hexToBytes } from "./bu-parser";

// noble/ed25519 v3 precisa de SHA-512 sync para alguns hosts
ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

const ANO_PRODUCAO = 2026;
const ANOS_TESTE = [2022, 2024];

const InputSchema = z.object({
  qr_strings: z.array(z.string().min(20).max(5000)).min(1).max(8),
  modo_teste: z.boolean().optional().default(false),
});

export const validarBU = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { qr_strings, modo_teste } = data;
    const userId = context.userId;

    const parsed = parseQRs(qr_strings);
    if (parsed.erro) {
      return { sucesso: false, codigo: "PARSE_ERRO", erro: parsed.erro };
    }
    const { campos, hash_final, assinatura, conteudo_completo, votos } = parsed;

    // ── Validar ano da eleição
    const dtpl = campos["DTPL"] ?? "";
    const ano_bu = parseInt(dtpl.substring(0, 4), 10);
    if (Number.isNaN(ano_bu)) {
      return { sucesso: false, codigo: "DTPL_INVALIDO", erro: "Campo DTPL ausente ou inválido." };
    }

    if (!modo_teste) {
      if (ano_bu !== ANO_PRODUCAO) {
        return {
          sucesso: false,
          codigo: "ANO_INVALIDO",
          erro: `Boletim rejeitado: ano ${ano_bu} não é válido para 2026. Use a Aba de Testes para BUs de outros anos.`,
        };
      }
      if (campos["FASE"] !== "O") {
        return {
          sucesso: false,
          codigo: "FASE_INVALIDA",
          erro: `Boletim rejeitado: fase "${campos["FASE"]}" não é permitida em produção (apenas "O" - Oficial).`,
        };
      }
    } else {
      if (!ANOS_TESTE.includes(ano_bu)) {
        return {
          sucesso: false,
          codigo: "ANO_TESTE_INVALIDO",
          erro: `Aba de testes aceita apenas BUs de 2022 ou 2024 (recebido: ${ano_bu}).`,
        };
      }
    }

    if (!assinatura) {
      return { sucesso: false, codigo: "SEM_ASSINATURA", erro: "Último QR Code não contém o campo ASSI (assinatura)." };
    }

    // ── Buscar chave pública TSE
    const versao_chave = campos["VRCH"];
    const sigla_uf = (campos["UNFE"] ?? "BR").toUpperCase();
    const tipo_eleicao = campos["ORLC"] === "COM" ? "COMUNITARIA" : "LEGAL";
    const fase = campos["FASE"] ?? "O";

    const { data: chaveRow, error: chaveErr } = await supabaseAdmin
      .from("chaves_tse")
      .select("chave_publica_hex")
      .eq("versao_chave", versao_chave)
      .eq("sigla_uf", sigla_uf)
      .eq("tipo_eleicao", tipo_eleicao)
      .eq("fase", fase)
      .eq("ativo", true)
      .maybeSingle();

    if (chaveErr || !chaveRow) {
      return {
        sucesso: false,
        codigo: "CHAVE_NAO_ENCONTRADA",
        erro: `Chave pública TSE não cadastrada para versão ${versao_chave} / UF ${sigla_uf} / fase ${fase}. Peça ao administrador para importar as chaves.`,
      };
    }

    // ── Verificar assinatura Ed25519
    let assinatura_valida = false;
    try {
      const pub = hexToBytes(chaveRow.chave_publica_hex);
      const hash = hexToBytes(hash_final);
      const sig = hexToBytes(assinatura);
      assinatura_valida = await ed.verifyAsync(sig, hash, pub);
    } catch (e: any) {
      return { sucesso: false, codigo: "ERRO_CRIPTO", erro: `Falha na verificação criptográfica: ${e.message}` };
    }

    if (!assinatura_valida) {
      return {
        sucesso: false,
        codigo: "ASSINATURA_INVALIDA",
        erro: "Assinatura digital inválida — este boletim pode ter sido adulterado.",
      };
    }

    // ── Verificar duplicata
    const id_carga = campos["IDCA"] ?? "";
    const zona = parseInt(campos["ZONA"] ?? "0", 10);
    const secao = parseInt(campos["SECA"] ?? "0", 10);
    const num_turno = parseInt(campos["TURN"] ?? "1", 10);

    const { data: existente } = await supabaseAdmin
      .from("boletins")
      .select("id, status")
      .eq("id_carga", id_carga)
      .eq("zona", zona)
      .eq("secao", secao)
      .eq("num_turno", num_turno)
      .eq("ano_eleicao", ano_bu)
      .eq("fase", fase)
      .in("status", ["validado", "pendente"])
      .maybeSingle();

    if (existente) {
      return {
        sucesso: false,
        codigo: "DUPLICADO",
        erro: "Este Boletim de Urna já foi enviado anteriormente.",
        bu_id: existente.id,
      };
    }

    // ── Gravar
    const boletim = {
      user_id: userId,
      ano_eleicao: ano_bu,
      fase,
      sigla_uf,
      municipio_num: parseInt(campos["MUNI"] ?? "0", 10),
      zona,
      secao,
      num_turno,
      proc_eleitoral: parseInt(campos["PROC"] ?? "0", 10) || null,
      pleito: parseInt(campos["PLEI"] ?? "0", 10) || null,
      id_ue: campos["IDUE"] ?? null,
      id_carga,
      versao_software: campos["VERS"] ?? null,
      origem: campos["ORIG"] ?? null,
      qr_raw: qr_strings.map((q, i) => ({ idx: i + 1, conteudo: q })),
      conteudo_completo,
      hash_final,
      assinatura,
      versao_chave,
      assinatura_valida: true,
      status: "validado" as const,
      modo_teste,
      votos,
      eleitores_aptos: parseInt(campos["APTO"] ?? "0", 10) || null,
      comparecimento: parseInt(campos["COMP"] ?? "0", 10) || null,
      eleitores_faltosos: parseInt(campos["FALT"] ?? "0", 10) || null,
    };

    const { data: inserted, error: dbErr } = await supabaseAdmin
      .from("boletins")
      .insert(boletim)
      .select("id")
      .single();

    if (dbErr || !inserted) {
      return { sucesso: false, codigo: "ERRO_DB", erro: dbErr?.message ?? "Falha ao gravar BU." };
    }

    return {
      sucesso: true,
      bu_id: inserted.id,
      ano_eleicao: ano_bu,
      modo_teste,
      uf: sigla_uf,
      zona,
      secao,
      cargos_apurados: votos.cargos.length,
    };
  });
