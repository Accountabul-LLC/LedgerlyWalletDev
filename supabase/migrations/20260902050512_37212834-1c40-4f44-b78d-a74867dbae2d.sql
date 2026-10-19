ALTER TABLE public.wallet_labels
ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE public.wallet_labels
ADD CONSTRAINT wallet_labels_provider_check
CHECK (provider IS NULL OR provider = 'joey');