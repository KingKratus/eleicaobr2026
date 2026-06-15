CREATE TABLE public.bus_teste_salvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  qrs JSONB NOT NULL,
  ano_eleicao INT,
  sigla_uf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bus_teste_salvos TO authenticated;
GRANT ALL ON public.bus_teste_salvos TO service_role;

ALTER TABLE public.bus_teste_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/moderador lê BUs salvos"
  ON public.bus_teste_salvos FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));

CREATE POLICY "Admin/moderador insere BUs salvos"
  ON public.bus_teste_salvos FOR INSERT
  TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador')) AND user_id = auth.uid());

CREATE POLICY "Admin/moderador remove BUs salvos"
  ON public.bus_teste_salvos FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));

CREATE INDEX idx_bus_teste_salvos_user ON public.bus_teste_salvos(user_id, created_at DESC);