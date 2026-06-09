ALTER TABLE public.ai_admin_settings ADD COLUMN IF NOT EXISTS enable_file_write boolean NOT NULL DEFAULT true;
UPDATE public.ai_admin_settings SET enable_file_write = true WHERE singleton = true;