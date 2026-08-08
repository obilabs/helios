-- Migration: Add public_assets table
-- Run this on your database to fix the "relation public_assets does not exist" error

CREATE TABLE IF NOT EXISTS public.public_assets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    asset_key character varying(255) NOT NULL,
    asset_type character varying(50) NOT NULL,
    module_source character varying(100),
    file_name character varying(255) NOT NULL,
    original_file_name character varying(255),
    file_path character varying(500) NOT NULL,
    cdn_url character varying(500),
    public_url character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size_bytes bigint NOT NULL,
    width integer,
    height integer,
    has_sizes boolean DEFAULT false,
    aspect_ratio numeric(5,2),
    usage_count integer DEFAULT 0,
    download_count integer DEFAULT 0,
    last_accessed_at timestamp with time zone,
    is_active boolean DEFAULT true,
    tags jsonb,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (organization_id, asset_key),
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES public.organization_users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_public_assets_org_type ON public.public_assets(organization_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_public_assets_org_module ON public.public_assets(organization_id, module_source);
CREATE INDEX IF NOT EXISTS idx_public_assets_cdn_url ON public.public_assets(cdn_url);
CREATE INDEX IF NOT EXISTS idx_public_assets_public_url ON public.public_assets(public_url);

-- Comments
COMMENT ON TABLE public.public_assets IS 'Public asset hosting for images, files, etc.';
COMMENT ON COLUMN public.public_assets.has_sizes IS 'True if photo has multiple size variations in photo_sizes table';
COMMENT ON COLUMN public.public_assets.aspect_ratio IS 'Width/height ratio (1.00 for square)';
