CREATE TABLE public.chaves_pub_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_eleicao integer NOT NULL,
  sigla_uf text NOT NULL,
  fase text NOT NULL,
  tipo_eleicao text NOT NULL DEFAULT 'LEGAL',
  conteudo_hex text NOT NULL,
  sha512_calculado text NOT NULL,
  sha512_esperado text,
  confere boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'upload',
  url_origem text,
  arquivo_nome text,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  motivo text,
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chaves_pub_pendentes TO authenticated;
GRANT ALL ON public.chaves_pub_pendentes TO service_role;
ALTER TABLE public.chaves_pub_pendentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/moderador lê fila de chaves" ON public.chaves_pub_pendentes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));
CREATE POLICY "Admin/moderador insere na fila" ON public.chaves_pub_pendentes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));
CREATE POLICY "Admin/moderador atualiza fila" ON public.chaves_pub_pendentes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));
CREATE POLICY "Admin remove da fila" ON public.chaves_pub_pendentes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_chaves_pend_status ON public.chaves_pub_pendentes (status, created_at DESC);

CREATE TABLE public.chaves_revalidacao (
  id bigserial PRIMARY KEY,
  chave_id integer REFERENCES public.chaves_tse(id) ON DELETE CASCADE,
  ano_eleicao integer,
  sigla_uf text,
  fase text,
  resultado text NOT NULL,
  detalhe text,
  executado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chaves_revalidacao TO authenticated;
GRANT ALL ON public.chaves_revalidacao TO service_role;
ALTER TABLE public.chaves_revalidacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/moderador lê revalidações" ON public.chaves_revalidacao
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderador'));

CREATE INDEX idx_revalidacao_chave ON public.chaves_revalidacao (chave_id, executado_em DESC);

ALTER TABLE public.chaves_tse
  ADD COLUMN IF NOT EXISTS ultima_revalidacao timestamptz,
  ADD COLUMN IF NOT EXISTS resultado_revalidacao text,
  ADD COLUMN IF NOT EXISTS suspeita boolean NOT NULL DEFAULT false;