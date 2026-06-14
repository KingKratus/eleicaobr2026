
ALTER TABLE public.chaves_tse
  ADD COLUMN IF NOT EXISTS valido_de DATE,
  ADD COLUMN IF NOT EXISTS valido_ate DATE,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS url_origem TEXT,
  ADD COLUMN IF NOT EXISTS abrangencia TEXT NOT NULL DEFAULT 'UF' CHECK (abrangencia IN ('BR','UF','MUN')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_chaves_tse_ano ON public.chaves_tse(ano_eleicao, ativo);
CREATE INDEX IF NOT EXISTS idx_chaves_tse_vrch ON public.chaves_tse(versao_chave);

DROP TRIGGER IF EXISTS trg_chaves_tse_updated ON public.chaves_tse;
CREATE TRIGGER trg_chaves_tse_updated
  BEFORE UPDATE ON public.chaves_tse
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
