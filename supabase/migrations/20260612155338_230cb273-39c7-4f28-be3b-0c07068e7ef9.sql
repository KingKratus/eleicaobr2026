ALTER TABLE public.boletins
  ADD COLUMN IF NOT EXISTS blockchain_tx TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_explorer_url TEXT,
  ADD COLUMN IF NOT EXISTS blockchain_chain_id INTEGER;