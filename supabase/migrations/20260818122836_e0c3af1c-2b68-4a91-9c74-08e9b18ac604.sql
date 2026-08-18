
CREATE OR REPLACE FUNCTION public.mapa_uf_turno(_ano integer, _turno integer, _teste boolean)
RETURNS TABLE(uf text, bus bigint, municipios bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.sigla_uf::text, count(*)::bigint, count(DISTINCT b.municipio_num)::bigint
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND (_turno IS NULL OR b.num_turno = _turno)
  GROUP BY b.sigla_uf
$$;

CREATE OR REPLACE FUNCTION public.mapa_mun_turno(_ano integer, _turno integer, _teste boolean, _uf text)
RETURNS TABLE(municipio_num integer, municipio_nome text, bus bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.municipio_num, max(b.municipio_nome), count(*)::bigint
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND b.sigla_uf = _uf AND (_turno IS NULL OR b.num_turno = _turno)
  GROUP BY b.municipio_num
  ORDER BY count(*) DESC
  LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.insights_timeline(_ano integer, _turno integer, _teste boolean)
RETURNS TABLE(bucket timestamptz, bus bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('hour', b.created_at) AS bucket, count(*)::bigint
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND (_turno IS NULL OR b.num_turno = _turno)
  GROUP BY 1 ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.insights_regiao(_ano integer, _turno integer, _teste boolean)
RETURNS TABLE(regiao text, bus bigint, ufs bigint, municipios bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
      WHEN b.sigla_uf IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
      WHEN b.sigla_uf IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
      WHEN b.sigla_uf IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
      WHEN b.sigla_uf IN ('ES','MG','RJ','SP') THEN 'Sudeste'
      WHEN b.sigla_uf IN ('PR','RS','SC') THEN 'Sul'
      ELSE 'Exterior' END AS regiao,
    count(*)::bigint, count(DISTINCT b.sigla_uf)::bigint, count(DISTINCT (b.sigla_uf, b.municipio_num))::bigint
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND (_turno IS NULL OR b.num_turno = _turno)
  GROUP BY 1 ORDER BY 2 DESC
$$;

CREATE OR REPLACE FUNCTION public.insights_participacao(_ano integer, _turno integer, _teste boolean, _uf text)
RETURNS TABLE(aptos bigint, comparecimento bigint, faltosos bigint, bus bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(b.eleitores_aptos),0)::bigint, coalesce(sum(b.comparecimento),0)::bigint,
         coalesce(sum(b.eleitores_faltosos),0)::bigint, count(*)::bigint
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND (_turno IS NULL OR b.num_turno = _turno)
    AND (_uf IS NULL OR b.sigla_uf = _uf)
$$;

CREATE OR REPLACE FUNCTION public.bus_publicos(_ano integer, _turno integer, _teste boolean, _uf text, _mun integer)
RETURNS TABLE(id uuid, sigla_uf text, municipio_num integer, municipio_nome text, zona integer, secao integer,
              num_turno integer, fase text, hash_final text, versao_chave text, assinatura_valida boolean,
              status text, modo_teste boolean, created_at timestamptz, eleitores_aptos integer,
              comparecimento integer, blockchain_tx text, blockchain_explorer_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.sigla_uf::text, b.municipio_num, b.municipio_nome, b.zona, b.secao, b.num_turno, b.fase::text,
         b.hash_final, b.versao_chave, b.assinatura_valida, b.status, b.modo_teste, b.created_at,
         b.eleitores_aptos, b.comparecimento, b.blockchain_tx, b.blockchain_explorer_url
  FROM public.boletins b
  WHERE b.status = 'validado' AND b.ano_eleicao = _ano AND b.modo_teste = _teste
    AND (_turno IS NULL OR b.num_turno = _turno)
    AND (_uf IS NULL OR b.sigla_uf = _uf)
    AND (_mun IS NULL OR b.municipio_num = _mun)
  ORDER BY b.created_at DESC
  LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.bu_publico_detalhe(_id uuid)
RETURNS TABLE(id uuid, ano_eleicao integer, sigla_uf text, municipio_num integer, municipio_nome text,
              zona integer, secao integer, num_turno integer, fase text, hash_final text, assinatura text,
              versao_chave text, assinatura_valida boolean, status text, modo_teste boolean,
              created_at timestamptz, eleitores_aptos integer, comparecimento integer, eleitores_faltosos integer,
              votos jsonb, blockchain_tx text, blockchain_explorer_url text, id_carga text, versao_software text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.ano_eleicao, b.sigla_uf::text, b.municipio_num, b.municipio_nome, b.zona, b.secao, b.num_turno,
         b.fase::text, b.hash_final, b.assinatura, b.versao_chave, b.assinatura_valida, b.status, b.modo_teste,
         b.created_at, b.eleitores_aptos, b.comparecimento, b.eleitores_faltosos, b.votos,
         b.blockchain_tx, b.blockchain_explorer_url, b.id_carga, b.versao_software
  FROM public.boletins b
  WHERE b.id = _id AND b.status = 'validado'
$$;

REVOKE ALL ON FUNCTION public.mapa_uf_turno(integer,integer,boolean) FROM public;
REVOKE ALL ON FUNCTION public.mapa_mun_turno(integer,integer,boolean,text) FROM public;
REVOKE ALL ON FUNCTION public.insights_timeline(integer,integer,boolean) FROM public;
REVOKE ALL ON FUNCTION public.insights_regiao(integer,integer,boolean) FROM public;
REVOKE ALL ON FUNCTION public.insights_participacao(integer,integer,boolean,text) FROM public;
REVOKE ALL ON FUNCTION public.bus_publicos(integer,integer,boolean,text,integer) FROM public;
REVOKE ALL ON FUNCTION public.bu_publico_detalhe(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.mapa_uf_turno(integer,integer,boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mapa_mun_turno(integer,integer,boolean,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_timeline(integer,integer,boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_regiao(integer,integer,boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_participacao(integer,integer,boolean,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bus_publicos(integer,integer,boolean,text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bu_publico_detalhe(uuid) TO anon, authenticated, service_role;
