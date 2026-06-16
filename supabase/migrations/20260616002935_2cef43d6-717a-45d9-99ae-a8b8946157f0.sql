ALTER TABLE public.chaves_tse
  ALTER COLUMN chave_publica_hex DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS hash_sha512_pub TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT;

ALTER TABLE public.chaves_tse
  DROP CONSTRAINT IF EXISTS chaves_tse_material_chk;
ALTER TABLE public.chaves_tse
  ADD CONSTRAINT chaves_tse_material_chk
  CHECK (chave_publica_hex IS NOT NULL OR hash_sha512_pub IS NOT NULL);