
-- ============================================================
-- ENUM de papéis (padrão de segurança recomendado)
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('colaborador', 'moderador', 'admin');

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  uf CHAR(2),
  municipio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfis são públicos para leitura"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Usuário atualiza seu próprio perfil"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Usuário insere seu próprio perfil"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- user_roles (separado de profiles por segurança)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'colaborador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê seus próprios papéis"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Função security-definer para checar papel (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================================
-- chaves_tse
-- ============================================================
CREATE TABLE public.chaves_tse (
  id SERIAL PRIMARY KEY,
  versao_chave TEXT NOT NULL,
  sigla_uf CHAR(2) NOT NULL,
  tipo_eleicao TEXT NOT NULL CHECK (tipo_eleicao IN ('LEGAL','COMUNITARIA')),
  fase CHAR(1) NOT NULL CHECK (fase IN ('O','S','T')),
  chave_publica_hex TEXT NOT NULL,
  ano_eleicao INT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(versao_chave, sigla_uf, tipo_eleicao, fase)
);

GRANT SELECT ON public.chaves_tse TO anon, authenticated;
GRANT ALL ON public.chaves_tse TO service_role;

ALTER TABLE public.chaves_tse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chaves TSE são públicas para leitura"
  ON public.chaves_tse FOR SELECT USING (true);
CREATE POLICY "Apenas admin gerencia chaves"
  ON public.chaves_tse FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- boletins
-- ============================================================
CREATE TABLE public.boletins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  ano_eleicao INT NOT NULL,
  fase CHAR(1) NOT NULL,
  sigla_uf CHAR(2) NOT NULL,
  municipio_num INT NOT NULL DEFAULT 0,
  municipio_nome TEXT,
  zona INT NOT NULL,
  secao INT NOT NULL,
  num_turno INT NOT NULL DEFAULT 1,
  proc_eleitoral INT,
  pleito INT,

  id_ue TEXT,
  id_carga TEXT,
  versao_software TEXT,
  origem TEXT,

  qr_raw JSONB NOT NULL,
  conteudo_completo TEXT NOT NULL,

  hash_final TEXT NOT NULL,
  assinatura TEXT NOT NULL,
  versao_chave TEXT NOT NULL,
  assinatura_valida BOOLEAN NOT NULL DEFAULT false,

  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','validado','rejeitado')),
  motivo_rejeicao TEXT,
  validado_por UUID REFERENCES auth.users(id),
  validado_em TIMESTAMPTZ,

  modo_teste BOOLEAN NOT NULL DEFAULT false,

  votos JSONB,

  eleitores_aptos INT,
  comparecimento INT,
  eleitores_faltosos INT,

  dt_abertura DATE,
  hr_abertura TIME,
  dt_fechamento DATE,
  hr_fechamento TIME,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boletins_localizacao
  ON public.boletins(ano_eleicao, fase, sigla_uf, municipio_num, zona, secao, num_turno);
CREATE INDEX idx_boletins_status ON public.boletins(status);
CREATE INDEX idx_boletins_user ON public.boletins(user_id);
CREATE INDEX idx_boletins_modo_teste ON public.boletins(modo_teste);

CREATE UNIQUE INDEX boletins_unico_valido
  ON public.boletins(id_carga, zona, secao, num_turno, ano_eleicao, fase)
  WHERE status IN ('validado','pendente');

GRANT SELECT, INSERT ON public.boletins TO authenticated;
GRANT ALL ON public.boletins TO service_role;

ALTER TABLE public.boletins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador insere BUs próprios"
  ON public.boletins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário vê seus BUs; moderador/admin vê todos"
  ON public.boletins FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderador')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Moderador/admin pode atualizar status"
  ON public.boletins FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'moderador')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- totais_cargo
-- ============================================================
CREATE TABLE public.totais_cargo (
  id SERIAL PRIMARY KEY,
  ano_eleicao INT NOT NULL,
  fase CHAR(1) NOT NULL,
  sigla_uf CHAR(2),
  municipio_num INT,
  cargo_codigo INT NOT NULL,
  num_turno INT NOT NULL,
  candidato_numero INT NOT NULL,
  total_votos BIGINT NOT NULL DEFAULT 0,
  total_bus_computados INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero)
);

GRANT SELECT ON public.totais_cargo TO anon, authenticated;
GRANT ALL ON public.totais_cargo TO service_role;

ALTER TABLE public.totais_cargo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Totais são públicos para leitura"
  ON public.totais_cargo FOR SELECT USING (true);

-- ============================================================
-- cobertura
-- ============================================================
CREATE TABLE public.cobertura (
  id SERIAL PRIMARY KEY,
  ano_eleicao INT NOT NULL,
  fase CHAR(1) NOT NULL,
  sigla_uf CHAR(2) NOT NULL,
  municipio_num INT NOT NULL,
  municipio_nome TEXT,
  total_secoes_estimado INT,
  total_bus_validados INT NOT NULL DEFAULT 0,
  percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ano_eleicao, fase, sigla_uf, municipio_num)
);

GRANT SELECT ON public.cobertura TO anon, authenticated;
GRANT ALL ON public.cobertura TO service_role;

ALTER TABLE public.cobertura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cobertura é pública para leitura"
  ON public.cobertura FOR SELECT USING (true);

-- ============================================================
-- Função utilitária: atualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Trigger: cria profile + role colaborador no signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'colaborador');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Trigger: agregação de totais quando BU é validado
-- ============================================================
CREATE OR REPLACE FUNCTION public.agregar_totais_bu()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cargo JSONB;
  candidato JSONB;
BEGIN
  -- Apenas BUs validados e não-teste contam para totais públicos
  IF NEW.status <> 'validado' OR NEW.modo_teste = true THEN
    RETURN NEW;
  END IF;

  -- Itera cargos
  IF NEW.votos IS NOT NULL AND NEW.votos ? 'cargos' THEN
    FOR cargo IN SELECT * FROM jsonb_array_elements(NEW.votos->'cargos') LOOP
      FOR candidato IN SELECT * FROM jsonb_array_elements(cargo->'candidatos') LOOP
        -- Nacional (sigla_uf = NULL)
        INSERT INTO public.totais_cargo
          (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, total_votos, total_bus_computados)
        VALUES
          (NEW.ano_eleicao, NEW.fase, NULL, NULL,
           (cargo->>'codigo')::INT, NEW.num_turno,
           (candidato->>'numero')::INT,
           (candidato->>'votos')::BIGINT, 1)
        ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero)
        DO UPDATE SET
          total_votos = totais_cargo.total_votos + EXCLUDED.total_votos,
          total_bus_computados = totais_cargo.total_bus_computados + 1,
          updated_at = now();

        -- Por UF
        INSERT INTO public.totais_cargo
          (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero, total_votos, total_bus_computados)
        VALUES
          (NEW.ano_eleicao, NEW.fase, NEW.sigla_uf, NULL,
           (cargo->>'codigo')::INT, NEW.num_turno,
           (candidato->>'numero')::INT,
           (candidato->>'votos')::BIGINT, 1)
        ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num, cargo_codigo, num_turno, candidato_numero)
        DO UPDATE SET
          total_votos = totais_cargo.total_votos + EXCLUDED.total_votos,
          total_bus_computados = totais_cargo.total_bus_computados + 1,
          updated_at = now();
      END LOOP;
    END LOOP;
  END IF;

  -- Atualiza cobertura
  INSERT INTO public.cobertura
    (ano_eleicao, fase, sigla_uf, municipio_num, municipio_nome, total_bus_validados, percentual)
  VALUES
    (NEW.ano_eleicao, NEW.fase, NEW.sigla_uf, NEW.municipio_num, NEW.municipio_nome, 1, 0)
  ON CONFLICT (ano_eleicao, fase, sigla_uf, municipio_num)
  DO UPDATE SET
    total_bus_validados = cobertura.total_bus_validados + 1,
    municipio_nome = COALESCE(EXCLUDED.municipio_nome, cobertura.municipio_nome),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agregar_totais
  AFTER INSERT OR UPDATE OF status ON public.boletins
  FOR EACH ROW EXECUTE FUNCTION public.agregar_totais_bu();

-- ============================================================
-- Realtime para resultados ao vivo
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.totais_cargo;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobertura;
ALTER PUBLICATION supabase_realtime ADD TABLE public.boletins;
