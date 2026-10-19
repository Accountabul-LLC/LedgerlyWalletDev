ALTER TABLE public.wallet_labels ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS wallet_labels_active_idx
  ON public.wallet_labels (user_id, address)
  WHERE removed_at IS NULL;