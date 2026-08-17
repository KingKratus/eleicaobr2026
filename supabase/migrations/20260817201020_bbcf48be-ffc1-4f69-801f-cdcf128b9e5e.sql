-- 1) Separar agregados de treinamento dos oficiais
ALTER TABLE public.cobertura ADD COLUMN IF NOT EXISTS modo_teste boolean NOT NULL DEFAULT false;
ALTER TABLE public.totais_cargo ADD COLUMN IF NOT EXISTS modo_teste boolean NOT NULL DEFAULT false;

ALTER TABLE public.cobertura DROP CONSTRAINT IF EXISTS cobertura_ano_eleicao_fase_sigla_uf_municipio_num_key;
CREATE UNIQUE INDEX IF NOT EXISTS cobertura_unica
  ON public.cobertura (ano_eleicao, fase, sigla_uf, municipio_num, modo_teste);

ALTER TABLE public.totais_cargo DROP CONSTRAINT IF EXISTS totais_cargo_ano_eleicao_fase_sigla_uf_municipio_num_cargo__key;
CREATE UNIQUE INDEX IF NOT EXISTS totais_cargo_unico
  ON public.totais_cargo (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, modo_teste)
  NULLS NOT DISTINCT;

-- 2) Anti-duplicação também no modo teste
DROP INDEX IF EXISTS public.boletins_unico_valido;
CREATE UNIQUE INDEX boletins_unico_valido
  ON public.boletins (id_carga, zona, secao, num_turno, ano_eleicao, fase, modo_teste)
  WHERE status = ANY (ARRAY['validado','pendente']);
CREATE UNIQUE INDEX IF NOT EXISTS boletins_hash_unico
  ON public.boletins (hash_final)
  WHERE status = ANY (ARRAY['validado','pendente']);

-- 3) Economia de armazenamento: conteúdo integral é recomputável a partir dos QRs
ALTER TABLE public.boletins ALTER COLUMN conteudo_completo DROP NOT NULL;

-- 4) Trigger agrega também BUs de treinamento, em linhas separadas
CREATE OR REPLACE FUNCTION public.agregar_totais_bu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cargo JSONB;
  candidato JSONB;
BEGIN
  IF NEW.status <> 'validado' THEN
    RETURN NEW;
  END IF;

  IF NEW.votos IS NOT NULL AND NEW.votos ? 'cargos' THEN
    FOR cargo IN SELECT * FROM jsonb_array_elements(NEW.votos->'cargos') LOOP
      FOR candidato IN SELECT * FROM jsonb_array_elements(cargo->'candidatos') LOOP
        INSERT INTO public.totais_cargo
          (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, total_votos, total_bus_computados, modo_teste)
        VALUES
          (NEW.ano_eleicao, NEW.fase, NULL, NULL,
           (cargo->>'codigo')::INT, NEW.num_turno,
           (candidato->>'numero')::INT,
           (candidato->>'votos')::BIGINT, 1, NEW.modo_teste)
        ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, modo_teste)
        DO UPDATE SET
          total_votos = totais_cargo.total_votos + EXCLUDED.total_votos,
          total_bus_computados = totais_cargo.total_bus_computados + 1,
          updated_at = now();

        INSERT INTO public.totais_cargo
          (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, total_votos, total_bus_computados, modo_teste)
        VALUES
          (NEW.ano_eleicao, NEW.fase, NEW.sigla_uf, NULL,
           (cargo->>'codigo')::INT, NEW.num_turno,
           (candidato->>'numero')::INT,
           (candidato->>'votos')::BIGINT, 1, NEW.modo_teste)
        ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, modo_teste)
        DO UPDATE SET
          total_votos = totais_cargo.total_votos + EXCLUDED.total_votos,
          total_bus_computados = totais_cargo.total_bus_computados + 1,
          updated_at = now();
      END LOOP;
    END LOOP;
  END IF;

  INSERT INTO public.cobertura
    (ano_eleicao, fase, sigla_uf, municipio_num, municipio_nome, total_bus_validados, percentual, modo_teste)
  VALUES
    (NEW.ano_eleicao, NEW.fase, NEW.sigla_uf, NEW.municipio_num, NEW.municipio_nome, 1, 0, NEW.modo_teste)
  ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num, modo_teste)
  DO UPDATE SET
    total_bus_validados = cobertura.total_bus_validados + 1,
    municipio_nome = COALESCE(EXCLUDED.municipio_nome, cobertura.municipio_nome),
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- 5) Agregado enxuto por UF (payload mínimo para o mapa)
CREATE OR REPLACE FUNCTION public.mapa_uf(_ano int, _teste boolean DEFAULT false)
RETURNS TABLE (uf char(2), bus bigint, municipios bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT sigla_uf, SUM(total_bus_validados)::bigint, COUNT(*)::bigint
  FROM public.cobertura
  WHERE ano_eleicao = _ano AND modo_teste = _teste
  GROUP BY sigla_uf
$$;

REVOKE ALL ON FUNCTION public.mapa_uf(int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mapa_uf(int, boolean) TO anon, authenticated, service_role;