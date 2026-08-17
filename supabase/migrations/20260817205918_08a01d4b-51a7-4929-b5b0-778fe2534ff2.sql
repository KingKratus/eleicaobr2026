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
        -- nacional
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

        -- por UF
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

        -- por município
        INSERT INTO public.totais_cargo
          (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, total_votos, total_bus_computados, modo_teste)
        VALUES
          (NEW.ano_eleicao, NEW.fase, NEW.sigla_uf, NEW.municipio_num,
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

-- Recalcula agregados a partir dos boletins já validados
DELETE FROM public.totais_cargo;
DELETE FROM public.cobertura;
UPDATE public.boletins SET status = status WHERE status = 'validado';

-- RPC: anos disponíveis por modo
CREATE OR REPLACE FUNCTION public.anos_disponiveis(_teste boolean DEFAULT false)
RETURNS TABLE(ano integer, bus bigint)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT ano_eleicao, SUM(total_bus_validados)::bigint
  FROM public.cobertura WHERE modo_teste = _teste
  GROUP BY ano_eleicao ORDER BY ano_eleicao DESC
$$;