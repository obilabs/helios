-- Migration: Add thumbnail_asset_id to signature_templates
-- Run this on your database to fix the "column st.thumbnail_asset_id does not exist" error

-- Add thumbnail_asset_id column to signature_templates
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS thumbnail_asset_id uuid;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'signature_templates_thumbnail_asset_id_fkey'
    ) THEN
        ALTER TABLE public.signature_templates
            ADD CONSTRAINT signature_templates_thumbnail_asset_id_fkey
            FOREIGN KEY (thumbnail_asset_id) REFERENCES public.public_assets(id);
    END IF;
END $$;

-- Also ensure other missing columns exist (added in later updates)
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS template_type character varying(20) DEFAULT 'signature'::character varying;
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS subject character varying(500);
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS css_content text;
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS category character varying(100);
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS variables_used jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.signature_templates ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add check constraint for template_type if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'signature_templates_type_check'
    ) THEN
        ALTER TABLE public.signature_templates
            ADD CONSTRAINT signature_templates_type_check
            CHECK (((template_type)::text = ANY ((ARRAY['signature'::character varying, 'email'::character varying, 'page'::character varying])::text[])));
    END IF;
END $$;

-- Create index on thumbnail_asset_id for better query performance
CREATE INDEX IF NOT EXISTS idx_signature_templates_thumbnail ON public.signature_templates(thumbnail_asset_id);
