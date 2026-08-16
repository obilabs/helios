-- ============================================================================
-- Helios Client Portal - Complete Database Schema
-- Single Organization Management System
-- ============================================================================
-- This schema creates all tables needed for a fresh installation.
-- Generated from live database - contains all 86 tables and functions.
-- ============================================================================
-- USAGE: Run this file on a fresh PostgreSQL database
-- ============================================================================





-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


-- Name: ensure_single_default_offboarding_template(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.ensure_single_default_offboarding_template() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE offboarding_templates
        SET is_default = false
        WHERE organization_id = NEW.organization_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;


-- Name: ensure_single_default_onboarding_template(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.ensure_single_default_onboarding_template() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE onboarding_templates
        SET is_default = false
        WHERE organization_id = NEW.organization_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;


-- Name: ensure_single_default_signature_template(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.ensure_single_default_signature_template() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE signature_templates
        SET is_default = false
        WHERE organization_id = NEW.organization_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;


-- Name: generate_media_asset_token(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.generate_media_asset_token() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    new_token VARCHAR(100);
    token_exists BOOLEAN;
BEGIN
    LOOP
        new_token := replace(replace(encode(uuid_generate_v4()::text::bytea, 'base64'), '+', '-'), '/', '_');
        new_token := substring(new_token, 1, 22);
        SELECT EXISTS (SELECT 1 FROM media_assets WHERE access_token = new_token) INTO token_exists;
        EXIT WHEN NOT token_exists;
    END LOOP;
    RETURN new_token;
END;
$$;


-- Name: get_campaign_stats(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.get_campaign_stats(p_campaign_id uuid) RETURNS TABLE(total_opens bigint, unique_opens bigint, unique_recipients bigint, top_performer_user_id uuid, top_performer_opens bigint)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_opens,
        COUNT(*) FILTER (WHERE is_unique = true)::BIGINT AS unique_opens,
        COUNT(DISTINCT ip_address_hash)::BIGINT AS unique_recipients,
        (
            SELECT ste.user_id
            FROM signature_tracking_events ste
            WHERE ste.campaign_id = p_campaign_id
            GROUP BY ste.user_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_performer_user_id,
        (
            SELECT COUNT(*)::BIGINT
            FROM signature_tracking_events ste
            WHERE ste.campaign_id = p_campaign_id
            GROUP BY ste.user_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_performer_opens
    FROM signature_tracking_events
    WHERE campaign_id = p_campaign_id;
END;
$$;


-- Name: get_organization_setting(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.get_organization_setting(org_id uuid, setting_key text, default_value text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT value INTO result
    FROM organization_settings
    WHERE organization_id = org_id AND key = setting_key;

    IF NOT FOUND AND default_value IS NOT NULL THEN
        INSERT INTO organization_settings (organization_id, key, value)
        VALUES (org_id, setting_key, default_value)
        ON CONFLICT (organization_id, key) DO NOTHING;
        RETURN default_value;
    END IF;

    RETURN result;
END;
$$;


-- Name: initialize_organization_labels(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.initialize_organization_labels() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM seed_default_labels(NEW.id);
    RETURN NEW;
END;
$$;


-- Name: log_activity(uuid, character varying, uuid, uuid, character varying, character varying, text, jsonb, inet, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.log_activity(p_organization_id uuid, p_action character varying, p_user_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO activity_logs (
        organization_id, user_id, actor_id, action,
        resource_type, resource_id, description,
        metadata, ip_address, user_agent
    ) VALUES (
        p_organization_id, p_user_id, p_actor_id, p_action,
        p_resource_type, p_resource_id, p_description,
        p_metadata, p_ip_address, p_user_agent
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;


-- Name: seed_default_labels(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.seed_default_labels(org_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO custom_labels (organization_id, canonical_name, label_singular, label_plural)
    VALUES
        (org_id, 'entity.user', 'User', 'Users'),
        (org_id, 'entity.workspace', 'Team', 'Teams'),
        (org_id, 'entity.access_group', 'Group', 'Groups'),
        (org_id, 'entity.policy_container', 'Org Unit', 'Org Units'),
        (org_id, 'entity.device', 'Device', 'Devices')
    ON CONFLICT (organization_id, canonical_name) DO NOTHING;
END;
$$;


-- Name: set_media_asset_access_token(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.set_media_asset_access_token() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.access_token IS NULL OR NEW.access_token = '' THEN
        NEW.access_token := generate_media_asset_token();
    END IF;
    RETURN NEW;
END;
$$;


-- Name: update_lifecycle_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_lifecycle_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- Name: update_named_condition_usage(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_named_condition_usage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- When a rule is created or updated, update usage counts
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Decrement old references if update
        IF TG_OP = 'UPDATE' AND OLD.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count - 1
            WHERE id = ANY(OLD.references_conditions);
        END IF;

        -- Increment new references
        IF NEW.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count + 1
            WHERE id = ANY(NEW.references_conditions);
        END IF;
    END IF;

    -- When a rule is deleted, decrement usage counts
    IF TG_OP = 'DELETE' THEN
        IF OLD.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count - 1
            WHERE id = ANY(OLD.references_conditions);
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;


-- Name: update_request_task_counts(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_request_task_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  total_count INTEGER;
  completed_count INTEGER;
BEGIN
  -- Get the request_id from either OLD or NEW
  DECLARE
    req_id UUID;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      req_id := OLD.request_id;
    ELSE
      req_id := NEW.request_id;
    END IF;

    IF req_id IS NOT NULL THEN
      SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed')
      INTO total_count, completed_count
      FROM lifecycle_tasks
      WHERE request_id = req_id;

      UPDATE user_requests
      SET tasks_total = total_count,
          tasks_completed = completed_count,
          status = CASE
            WHEN completed_count = total_count AND total_count > 0 THEN 'completed'
            WHEN completed_count > 0 THEN 'in_progress'
            ELSE status
          END
      WHERE id = req_id;
    END IF;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


-- Name: update_rules_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_rules_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- Name: update_user_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.update_user_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- Name: verify_single_tenant_integrity(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.verify_single_tenant_integrity() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    org_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;
    IF org_count = 0 THEN
        RAISE NOTICE 'No organization found. Setup required.';
        RETURN false;
    ELSIF org_count = 1 THEN
        RAISE NOTICE 'Single-tenant integrity verified: 1 organization found.';
        RETURN true;
    ELSE
        RAISE EXCEPTION 'CRITICAL: Single-tenant violation detected! Found % organizations.', org_count;
    END IF;
END;
$$;




-- Name: access_group_members; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.access_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    access_group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    member_type character varying(50) DEFAULT 'member'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    joined_at timestamp with time zone DEFAULT now(),
    removed_at timestamp with time zone,
    synced_from_platform boolean DEFAULT true
);


-- Name: access_groups; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.access_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    email character varying(255),
    platform character varying(50) NOT NULL,
    group_type character varying(50) NOT NULL,
    external_id character varying(255),
    external_url character varying(500),
    allow_external_members boolean DEFAULT false,
    is_public boolean DEFAULT false,
    is_active boolean DEFAULT true,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone
);


-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    actor_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id character varying(255),
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: ai_chat_history; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ai_chat_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    tool_calls jsonb,
    tool_call_id character varying(100),
    tool_name character varying(100),
    page_context character varying(255),
    created_at timestamp with time zone DEFAULT now()
);


-- Name: ai_config; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ai_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    primary_endpoint_url character varying(500) NOT NULL,
    primary_api_key_encrypted text,
    primary_model character varying(100) NOT NULL,
    fallback_endpoint_url character varying(500),
    fallback_api_key_encrypted text,
    fallback_model character varying(100),
    tool_call_model character varying(100),
    is_enabled boolean DEFAULT false,
    max_tokens_per_request integer DEFAULT 4096,
    temperature numeric(3,2) DEFAULT 0.7,
    context_window_tokens integer DEFAULT 8000,
    requests_per_minute_limit integer DEFAULT 20,
    tokens_per_day_limit integer DEFAULT 100000,
    mcp_enabled boolean DEFAULT false,
    mcp_server_url character varying(500),
    system_prompt text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: ai_usage_log; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ai_usage_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint_used character varying(50),
    model_used character varying(100),
    request_type character varying(50),
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    latency_ms integer,
    was_tool_call boolean DEFAULT false,
    tools_invoked text[],
    was_successful boolean DEFAULT true,
    error_message text,
    error_code character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


-- Name: api_key_usage_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.api_key_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    endpoint character varying(255) NOT NULL,
    method character varying(10) NOT NULL,
    status_code integer,
    response_time_ms integer,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: api_keys; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    key_hash character varying(255) NOT NULL,
    -- 50, not 20: generateApiKey() emits "helios_<env>_<20 chars>" = 23 chars,
    -- so a 20-char column fails the pairing INSERT with "value too long".
    key_prefix character varying(50) NOT NULL,
    scopes text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0,
    rate_limit_per_minute integer DEFAULT 60,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    -- ---------------------------------------------------------------------
    -- Typed-key contract. This table used to ship pre-typed (the 15 columns
    -- above), while the CODE required all of the below — so a FRESH install
    -- could not issue any typed key, and MTP pairing failed outright. It was
    -- unblocked on 2026-08-13 by patching the running container by hand, which
    -- meant the fix existed nowhere in the repo and died on the next
    -- `down -v`. These columns are that fix, made reproducible.
    -- ---------------------------------------------------------------------
    -- Key discriminator: service | vendor | helios-mtp-pairing
    type character varying(20) DEFAULT 'service'::character varying NOT NULL,
    -- JSONB scope array, read back via Array.isArray(row.permissions)
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    -- Pairing lifecycle (NULL for service/vendor keys). The handshake claims a
    -- key exactly once via an atomic conditional UPDATE guarded on
    -- `paired_at IS NULL AND pairing_window_expires_at > NOW()`.
    pairing_window_expires_at timestamp with time zone,
    paired_at timestamp with time zone,
    paired_from_ip inet,
    paired_user_agent text,
    -- Authoritative revocation: a revoked pairing returns an explicit revoked
    -- signal rather than a bare 401, so an outage is distinguishable from a
    -- revocation.
    revoked_at timestamp with time zone,
    revoked_by uuid,
    -- Generic typed-key config written by the create/renew routes.
    service_config jsonb,
    vendor_config jsonb,
    ip_whitelist jsonb,
    rate_limit_config jsonb
);


-- Name: assets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.assets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    asset_type character varying(100) NOT NULL,
    asset_tag character varying(100),
    serial_number character varying(255),
    manufacturer character varying(255),
    model character varying(255),
    name character varying(255),
    description text,
    purchase_date date,
    warranty_expiry_date date,
    cost numeric(10,2),
    status character varying(50) DEFAULT 'available'::character varying,
    location character varying(255),
    notes text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    action character varying(50) NOT NULL,
    resource character varying(255) NOT NULL,
    resource_id uuid,
    details jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: auth_accounts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.auth_accounts (
    id text NOT NULL,
    user_id uuid NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp with time zone,
    scope text,
    id_token text,
    password text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.auth_sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: auth_verifications; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.auth_verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    rule_type character varying(50) NOT NULL,
    conditions jsonb NOT NULL,
    priority integer DEFAULT 0,
    is_enabled boolean DEFAULT true,
    nesting_depth integer DEFAULT 0,
    condition_count integer DEFAULT 0,
    references_conditions uuid[] DEFAULT '{}'::uuid[],
    config jsonb DEFAULT '{}'::jsonb,
    last_evaluated_at timestamp with time zone,
    last_match_count integer DEFAULT 0,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: TABLE automation_rules; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.automation_rules IS 'Unified rules for dynamic groups, template matching, training assignment, etc.';


-- Name: COLUMN automation_rules.rule_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.automation_rules.rule_type IS 'Type: dynamic_group, template_match, training_assign, notification, workflow';


-- Name: available_modules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.available_modules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    module_key character varying(100),
    description text,
    icon character varying(100),
    version character varying(50) DEFAULT '1.0.0'::character varying,
    is_available boolean DEFAULT true,
    config_schema jsonb,
    requires_credentials boolean DEFAULT true,
    category character varying(50) DEFAULT 'integration'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: bulk_operations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.bulk_operations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    operation_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    total_items integer DEFAULT 0,
    processed_items integer DEFAULT 0,
    failed_items integer DEFAULT 0,
    parameters jsonb DEFAULT '{}'::jsonb,
    results jsonb DEFAULT '[]'::jsonb,
    error_log jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone
);


-- Name: campaign_analytics_summary; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.campaign_analytics_summary AS
SELECT
    NULL::uuid AS campaign_id,
    NULL::uuid AS organization_id,
    NULL::character varying(255) AS name,
    NULL::character varying(20) AS status,
    NULL::timestamp with time zone AS start_date,
    NULL::timestamp with time zone AS end_date,
    NULL::boolean AS tracking_enabled,
    NULL::bigint AS enrolled_users,
    NULL::bigint AS total_opens,
    NULL::bigint AS unique_opens,
    NULL::bigint AS unique_recipients,
    NULL::numeric AS opens_per_user;


-- Name: campaign_assignments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.campaign_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    assignment_type character varying(30) NOT NULL,
    target_id uuid,
    target_value character varying(500),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaign_assignments_assignment_type_check CHECK (((assignment_type)::text = ANY ((ARRAY['user'::character varying, 'group'::character varying, 'dynamic_group'::character varying, 'department'::character varying, 'ou'::character varying, 'organization'::character varying])::text[])))
);


-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid,
    budget_amount numeric(15,2),
    budget_currency character varying(3) DEFAULT 'USD'::character varying,
    fiscal_year integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


-- Name: organization_users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.organization_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    department character varying(255),
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    last_login timestamp with time zone,
    password_reset_token character varying(255),
    password_reset_expires timestamp with time zone,
    email_verification_token character varying(255),
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret character varying(255),
    job_title character varying(255),
    organizational_unit character varying(500),
    location character varying(255),
    reporting_manager_id uuid,
    employee_id character varying(100),
    employee_type character varying(50) DEFAULT 'Full Time'::character varying,
    cost_center character varying(100),
    start_date date,
    end_date date,
    bio text,
    mobile_phone character varying(50),
    work_phone character varying(50),
    work_phone_extension character varying(20),
    timezone character varying(100) DEFAULT 'UTC'::character varying,
    preferred_language character varying(10) DEFAULT 'en'::character varying,
    google_workspace_id character varying(255),
    microsoft_365_id character varying(64),
    microsoft_365_upn character varying(255),
    github_username character varying(255),
    slack_user_id character varying(255),
    jumpcloud_user_id character varying(255),
    associate_id character varying(100),
    google_workspace_sync_status character varying(50) DEFAULT 'not_synced'::character varying,
    google_workspace_last_sync timestamp with time zone,
    microsoft_365_sync_status character varying(50) DEFAULT 'not_synced'::character varying,
    microsoft_365_last_sync timestamp with time zone,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    preferences jsonb DEFAULT '{}'::jsonb,
    avatar_url character varying(500),
    photo_data text,
    is_guest boolean DEFAULT false,
    guest_expires_at timestamp with time zone,
    guest_invited_by uuid,
    guest_invited_at timestamp with time zone,
    user_type character varying(20) DEFAULT 'local'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    department_id uuid,
    location_id uuid,
    cost_center_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organization_users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying, 'user'::character varying])::text[])))
);


-- Name: user_assets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_assets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    assigned_by uuid,
    return_date timestamp with time zone,
    returned_at timestamp with time zone,
    condition_at_assignment character varying(50) DEFAULT 'good'::character varying,
    condition_at_return character varying(50),
    notes text,
    is_primary boolean DEFAULT false
);


-- Name: current_user_assets; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.current_user_assets AS
 SELECT ua.id,
    ua.user_id,
    ua.asset_id,
    ua.assigned_at,
    ua.assigned_by,
    ua.return_date,
    ua.returned_at,
    ua.condition_at_assignment,
    ua.condition_at_return,
    ua.notes,
    ua.is_primary,
    u.email AS user_email,
    u.first_name,
    u.last_name,
    a.asset_type,
    a.manufacturer,
    a.model,
    a.serial_number,
    a.asset_tag
   FROM ((public.user_assets ua
     JOIN public.organization_users u ON ((ua.user_id = u.id)))
     JOIN public.assets a ON ((ua.asset_id = a.id)))
  WHERE (ua.returned_at IS NULL);


-- Name: custom_field_definitions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.custom_field_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    field_key character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    field_type character varying(50) NOT NULL,
    entity_type character varying(50) DEFAULT 'user'::character varying NOT NULL,
    options jsonb,
    validation_rules jsonb,
    is_required boolean DEFAULT false,
    is_searchable boolean DEFAULT true,
    is_filterable boolean DEFAULT true,
    display_order integer DEFAULT 0,
    section character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: custom_field_values; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.custom_field_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    entity_type character varying(50) NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: custom_labels; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.custom_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    canonical_name character varying(100) NOT NULL,
    label_singular character varying(30) NOT NULL,
    label_plural character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT custom_labels_label_plural_check CHECK ((char_length((label_plural)::text) <= 30)),
    CONSTRAINT custom_labels_label_plural_check1 CHECK (((label_plural)::text <> ''::text)),
    CONSTRAINT custom_labels_label_singular_check CHECK ((char_length((label_singular)::text) <= 30)),
    CONSTRAINT custom_labels_label_singular_check1 CHECK (((label_singular)::text <> ''::text))
);


-- Name: gw_synced_users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.gw_synced_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    google_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    given_name character varying(255),
    family_name character varying(255),
    full_name character varying(255),
    is_admin boolean DEFAULT false,
    is_suspended boolean DEFAULT false,
    org_unit_path character varying(255),
    department character varying(255),
    job_title character varying(255),
    last_login_time timestamp with time zone,
    creation_time timestamp with time zone,
    raw_data jsonb,
    last_sync_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: organization_modules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.organization_modules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    module_id uuid NOT NULL,
    is_enabled boolean DEFAULT false,
    is_configured boolean DEFAULT false,
    config jsonb DEFAULT '{}'::jsonb,
    last_sync_at timestamp with time zone,
    sync_status character varying(50),
    sync_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: organizations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    domain character varying(255) NOT NULL,
    logo text,
    primary_color character varying(7),
    secondary_color character varying(7),
    is_setup_complete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: dashboard_stats; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.dashboard_stats AS
 SELECT id AS organization_id,
    name AS organization_name,
    ( SELECT count(*) AS count
           FROM public.organization_users
          WHERE ((organization_users.organization_id = o.id) AND (organization_users.is_active = true))) AS total_users,
    ( SELECT count(*) AS count
           FROM public.organization_users
          WHERE ((organization_users.organization_id = o.id) AND ((organization_users.role)::text = 'admin'::text))) AS admin_users,
    ( SELECT count(*) AS count
           FROM public.organization_modules
          WHERE ((organization_modules.organization_id = o.id) AND (organization_modules.is_enabled = true))) AS enabled_modules,
    ( SELECT count(*) AS count
           FROM public.gw_synced_users
          WHERE (gw_synced_users.organization_id = o.id)) AS synced_google_users,
    ( SELECT max(organization_modules.last_sync_at) AS max
           FROM public.organization_modules
          WHERE (organization_modules.organization_id = o.id)) AS last_sync,
    is_setup_complete,
    created_at
   FROM public.organizations o;


-- Name: departments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    parent_department_id uuid,
    org_unit_id character varying(255),
    org_unit_path character varying(500),
    auto_sync_to_ou boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT departments_check CHECK ((parent_department_id <> id))
);


-- Name: dynamic_group_rules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.dynamic_group_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    rule_type character varying(50) NOT NULL,
    field_name character varying(100) NOT NULL,
    operator character varying(20) NOT NULL,
    value text NOT NULL,
    logic_operator character varying(10) DEFAULT 'AND'::character varying,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: email_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.email_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    template_key character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    body_html text NOT NULL,
    body_text text,
    variables jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feature_key character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_enabled boolean DEFAULT false,
    category character varying(50) DEFAULT 'general'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Seed default feature flags
-- These control which features are visible in the UI
INSERT INTO public.feature_flags (feature_key, name, description, is_enabled, category) VALUES
    -- Automation features
    ('automation.offboarding_templates', 'Offboarding Templates', 'Create and manage offboarding templates', true, 'automation'),
    ('automation.offboarding_execution', 'Offboarding Execution', 'Execute offboarding workflows', true, 'automation'),
    ('automation.onboarding_templates', 'Onboarding Templates', 'Create and manage onboarding templates', true, 'automation'),
    ('automation.onboarding_execution', 'Onboarding Execution', 'Execute onboarding workflows', true, 'automation'),
    ('automation.scheduled_actions', 'Scheduled Actions', 'View and manage scheduled automation tasks', true, 'automation'),
    ('automation.workflows', 'Workflows', 'Custom workflow builder (advanced)', false, 'automation'),
    -- Insights features (advanced - disabled by default)
    ('insights.reports', 'Reports', 'Generate and view reports', false, 'insights'),
    ('insights.team_analytics', 'Team Analytics', 'View team analytics and metrics', false, 'insights'),
    -- Developer Console (power user - disabled by default)
    ('console.pop_out', 'Pop-out Console', 'Open console in separate window', false, 'console'),
    ('console.pinnable_help', 'Pinnable Help Panel', 'Dock help panel to side of console', false, 'console'),
    ('console.command_audit', 'Command Audit Logging', 'Log console commands to audit trail', false, 'console'),
    -- User management
    ('users.export', 'User Export', 'Export users to CSV/JSON', false, 'users'),
    ('users.platform_filter', 'Platform Filter', 'Filter users by platform', false, 'users'),
    ('users.delete', 'User Deletion', 'Delete users from the system', true, 'users'),
    -- Integrations
    ('integrations.email_archive', 'Email Archive', 'Archive departed user emails', false, 'integrations'),
    ('integrations.microsoft_365_relay', 'Microsoft 365 Relay', 'Transparent proxy for Microsoft Graph API', false, 'integrations'),
    ('integrations.google_workspace', 'Google Workspace', 'Google Workspace integration', true, 'integrations'),
    ('integrations.microsoft_365', 'Microsoft 365', 'Microsoft 365 integration', true, 'integrations'),
    -- Signatures
    ('signatures.templates', 'Signature Templates', 'Create and manage email signature templates', true, 'signatures'),
    ('signatures.campaigns', 'Signature Campaigns', 'Time-limited signature campaigns with tracking', true, 'signatures'),
    ('signatures.tracking', 'Signature Tracking', 'Track signature views with pixels', true, 'signatures'),
    -- Navigation sections
    ('nav.section.automation', 'Automation Section', 'Show Automation section in navigation', true, 'navigation'),
    ('nav.section.assets', 'Assets Section', 'Show Assets section in navigation', true, 'navigation'),
    ('nav.section.security', 'Security Section', 'Show Security section in navigation', true, 'navigation'),
    ('nav.section.journeys', 'Journeys Section', 'Show Journeys section in navigation', true, 'navigation'),
    ('nav.section.insights', 'Insights Section', 'Show Insights section in navigation', false, 'navigation'),
    -- Navigation - Journeys
    ('nav.onboarding', 'Onboarding', 'Show Onboarding in navigation', true, 'navigation'),
    ('nav.offboarding', 'Offboarding', 'Show Offboarding in navigation', true, 'navigation'),
    ('nav.requests', 'Requests', 'Show Requests in navigation', false, 'navigation'),
    ('nav.tasks', 'My Tasks', 'Show My Tasks in navigation', true, 'navigation'),
    ('nav.training', 'Training', 'Show Training in navigation', false, 'navigation'),
    -- Navigation - Automation
    ('nav.signatures', 'Signatures', 'Show Signatures in navigation', true, 'navigation'),
    ('nav.scheduled_actions', 'Scheduled Actions', 'Show Scheduled Actions in navigation', true, 'navigation'),
    ('nav.rules_engine', 'Rules Engine', 'Show Rules Engine in navigation', false, 'navigation'),
    ('nav.workflows', 'Workflows Navigation', 'Show Workflows in navigation', false, 'navigation'),
    -- Navigation - Assets
    ('nav.it_assets', 'IT Assets', 'Show IT Assets in navigation', true, 'navigation'),
    ('nav.media_files', 'Media Files', 'Show Media Files in navigation', true, 'navigation'),
    -- Navigation - Security
    ('nav.mail_search', 'Mail Search', 'Show Mail Search in navigation', true, 'navigation'),
    ('nav.security_events', 'Security Events', 'Show Security Events in navigation', true, 'navigation'),
    ('nav.oauth_apps', 'OAuth Apps', 'Show OAuth Apps in navigation', true, 'navigation'),
    ('nav.audit_logs', 'Audit Logs', 'Show Audit Logs in navigation', true, 'navigation'),
    ('nav.licenses', 'Licenses', 'Show Licenses in navigation', true, 'navigation'),
    ('nav.external_sharing', 'External Sharing', 'Show External Sharing in navigation', true, 'navigation'),
    -- Navigation - Insights (disabled by default)
    ('nav.hr_dashboard', 'HR Dashboard', 'Show HR Dashboard in navigation', false, 'navigation'),
    ('nav.manager_dashboard', 'Manager Dashboard', 'Show Manager Dashboard in navigation', false, 'navigation'),
    ('nav.lifecycle_analytics', 'Lifecycle Analytics', 'Show Analytics in navigation', false, 'navigation'),
    ('nav.reports', 'Reports Navigation', 'Show Reports in navigation', false, 'navigation'),
    -- Navigation - Incomplete/Beta
    ('nav.email_archive', 'Email Archive Navigation', 'Show Email Archive in navigation', false, 'navigation');


-- Name: gw_credentials; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.gw_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    service_account_key text NOT NULL,
    admin_email character varying(255) NOT NULL,
    domain character varying(255) NOT NULL,
    scopes text[],
    is_valid boolean DEFAULT false,
    last_validated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: gw_groups; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.gw_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    google_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255),
    description text,
    member_count integer DEFAULT 0,
    raw_data jsonb,
    last_sync_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: gw_org_units; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.gw_org_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    google_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(255) NOT NULL,
    parent_id character varying(255),
    description text,
    raw_data jsonb,
    last_sync_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: helpdesk_tickets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.helpdesk_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    assigned_to uuid,
    title character varying(255) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'open'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    category character varying(50),
    resolution text,
    resolved_at timestamp with time zone,
    sla_due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: job_titles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.job_titles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    department_id uuid,
    level character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


-- Name: lifecycle_tasks; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lifecycle_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    request_id uuid,
    user_id uuid,
    title character varying(255) NOT NULL,
    description text,
    category character varying(50),
    assignee_type character varying(20) NOT NULL,
    assignee_id uuid,
    assignee_role character varying(50),
    trigger_type character varying(30),
    trigger_offset_days integer DEFAULT 0,
    due_date date,
    status character varying(20) DEFAULT 'pending'::character varying,
    completed_at timestamp with time zone,
    completed_by uuid,
    completion_notes text,
    action_type character varying(50),
    action_config jsonb,
    scheduled_action_id uuid,
    sequence_order integer DEFAULT 0,
    depends_on_task_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lifecycle_tasks_assignee_type_check CHECK (((assignee_type)::text = ANY ((ARRAY['user'::character varying, 'manager'::character varying, 'hr'::character varying, 'it'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT lifecycle_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'skipped'::character varying, 'blocked'::character varying])::text[])))
);


-- Name: TABLE lifecycle_tasks; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.lifecycle_tasks IS 'Tasks assigned to parties (user, manager, hr, it, system) during lifecycle processes';


-- Name: COLUMN lifecycle_tasks.assignee_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.lifecycle_tasks.assignee_type IS 'Type of assignee: user, manager, hr, it, or system';


-- Name: COLUMN lifecycle_tasks.trigger_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.lifecycle_tasks.trigger_type IS 'When task is triggered: on_approval, days_before_start, on_start, days_after_start';


-- Name: COLUMN lifecycle_tasks.trigger_offset_days; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.lifecycle_tasks.trigger_offset_days IS 'Days offset from trigger (negative for before, positive for after)';


-- Name: COLUMN lifecycle_tasks.action_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.lifecycle_tasks.action_type IS 'For system tasks: create_account, add_to_group, send_email, etc.';


-- Name: locations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(50),
    type character varying(50) DEFAULT 'office'::character varying,
    description text,
    parent_id uuid,
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    country character varying(100),
    timezone character varying(50),
    latitude numeric(10,8),
    longitude numeric(11,8),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT locations_check CHECK ((parent_id <> id)),
    CONSTRAINT locations_type_check CHECK (((type)::text = ANY ((ARRAY['headquarters'::character varying, 'office'::character varying, 'remote'::character varying, 'region'::character varying, 'warehouse'::character varying, 'datacenter'::character varying])::text[])))
);


-- Name: master_data_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.master_data_settings (
    organization_id uuid NOT NULL,
    enforce_departments boolean DEFAULT false,
    enforce_locations boolean DEFAULT false,
    enforce_cost_centers boolean DEFAULT false,
    enforce_job_titles boolean DEFAULT false,
    departments_migrated boolean DEFAULT false,
    locations_migrated boolean DEFAULT false,
    cost_centers_migrated boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


-- Name: media_asset_folders; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.media_asset_folders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(500) NOT NULL,
    parent_id uuid,
    drive_folder_id character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: media_asset_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.media_asset_settings (
    organization_id uuid NOT NULL,
    storage_backend character varying(20) DEFAULT 'google_drive'::character varying NOT NULL,
    drive_shared_drive_id character varying(100),
    drive_root_folder_id character varying(100),
    cache_ttl_seconds integer DEFAULT 3600,
    max_file_size_mb integer DEFAULT 10,
    allowed_mime_types text[] DEFAULT ARRAY['image/png'::text, 'image/jpeg'::text, 'image/gif'::text, 'image/webp'::text, 'image/svg+xml'::text, 'image/x-icon'::text],
    is_configured boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: media_assets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.media_assets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    storage_type character varying(20) DEFAULT 'google_drive'::character varying NOT NULL,
    storage_path character varying(500) NOT NULL,
    name character varying(255) NOT NULL,
    filename character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes bigint,
    folder_id uuid,
    category character varying(50),
    access_token character varying(100) NOT NULL,
    is_public boolean DEFAULT true,
    access_count integer DEFAULT 0,
    last_accessed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: module_entity_providers; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.module_entity_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_key character varying(100) NOT NULL,
    entity_canonical_name character varying(100) NOT NULL,
    is_primary_provider boolean DEFAULT false
);


-- Name: modules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.modules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    icon character varying(255),
    version character varying(50) NOT NULL,
    is_available boolean DEFAULT true,
    config_schema jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: ms_credentials; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ms_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id character varying(64) NOT NULL,
    client_id character varying(64) NOT NULL,
    client_secret_encrypted text NOT NULL,
    is_active boolean DEFAULT true,
    last_sync_at timestamp with time zone,
    sync_status character varying(50) DEFAULT 'pending'::character varying,
    sync_error text,
    access_token_encrypted text,
    token_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


-- Name: ms_group_memberships; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ms_group_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    membership_type character varying(50) DEFAULT 'member'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: ms_licenses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ms_licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    sku_id character varying(64) NOT NULL,
    sku_part_number character varying(255),
    display_name character varying(255),
    total_units integer DEFAULT 0,
    consumed_units integer DEFAULT 0,
    available_units integer DEFAULT 0,
    service_plans jsonb,
    raw_data jsonb,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: ms_synced_groups; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ms_synced_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ms_id character varying(64) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    mail character varying(255),
    mail_enabled boolean DEFAULT false,
    security_enabled boolean DEFAULT true,
    group_types jsonb,
    member_count integer DEFAULT 0,
    raw_data jsonb,
    last_sync_at timestamp with time zone,
    sync_hash character varying(64),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: ms_synced_users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ms_synced_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ms_id character varying(64) NOT NULL,
    upn character varying(255),
    display_name character varying(255),
    given_name character varying(255),
    surname character varying(255),
    email character varying(255),
    job_title character varying(255),
    department character varying(255),
    office_location character varying(255),
    company_name character varying(255),
    mobile_phone character varying(50),
    business_phones jsonb,
    is_account_enabled boolean DEFAULT true,
    is_admin boolean DEFAULT false,
    manager_id character varying(64),
    assigned_licenses jsonb,
    raw_data jsonb,
    last_sync_at timestamp with time zone,
    sync_hash character varying(64),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: named_conditions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.named_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    conditions jsonb NOT NULL,
    nesting_depth integer DEFAULT 0,
    references_conditions uuid[] DEFAULT '{}'::uuid[],
    usage_count integer DEFAULT 0,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: TABLE named_conditions; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.named_conditions IS 'Reusable condition blocks that can be referenced by automation rules';


-- Name: COLUMN named_conditions.nesting_depth; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.named_conditions.nesting_depth IS 'How deep the condition nesting goes (max 3 allowed)';


-- Name: offboarding_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.offboarding_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    drive_action character varying(50) DEFAULT 'transfer_manager'::character varying,
    drive_transfer_to_user_id uuid,
    drive_archive_shared_drive_id character varying(100),
    drive_delete_after_days integer DEFAULT 90,
    email_action character varying(50) DEFAULT 'forward_manager'::character varying,
    email_forward_to_user_id uuid,
    email_forward_duration_days integer DEFAULT 30,
    email_auto_reply_message text,
    email_auto_reply_subject character varying(500),
    calendar_decline_future_meetings boolean DEFAULT true,
    calendar_transfer_meeting_ownership boolean DEFAULT true,
    calendar_transfer_to_manager boolean DEFAULT true,
    calendar_transfer_to_user_id uuid,
    remove_from_all_groups boolean DEFAULT true,
    remove_from_shared_drives boolean DEFAULT true,
    revoke_oauth_tokens boolean DEFAULT true,
    revoke_app_passwords boolean DEFAULT true,
    sign_out_all_devices boolean DEFAULT true,
    reset_password boolean DEFAULT true,
    remove_signature boolean DEFAULT true,
    set_offboarding_signature boolean DEFAULT false,
    offboarding_signature_text text,
    wipe_mobile_devices boolean DEFAULT false,
    wipe_requires_confirmation boolean DEFAULT true,
    account_action character varying(50) DEFAULT 'suspend_on_last_day'::character varying,
    delete_account boolean DEFAULT false,
    delete_after_days integer DEFAULT 90,
    license_action character varying(50) DEFAULT 'remove_on_suspension'::character varying,
    notify_manager boolean DEFAULT true,
    notify_it_admin boolean DEFAULT true,
    notify_hr boolean DEFAULT false,
    notification_email_addresses text[] DEFAULT '{}'::text[],
    notification_message text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    timeline jsonb DEFAULT '[]'::jsonb
);


-- Name: COLUMN offboarding_templates.timeline; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.offboarding_templates.timeline IS 'Timeline of actions with triggers and offsets for lifecycle automation';


-- Name: onboarding_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.onboarding_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    department_id uuid,
    google_license_sku character varying(100),
    google_org_unit_path character varying(500),
    google_services jsonb DEFAULT '{"chat": true, "docs": true, "meet": true, "drive": true, "gmail": true, "sheets": true, "slides": true, "calendar": true}'::jsonb,
    group_ids uuid[] DEFAULT '{}'::uuid[],
    shared_drive_access jsonb DEFAULT '[]'::jsonb,
    calendar_subscriptions text[] DEFAULT '{}'::text[],
    signature_template_id uuid,
    default_job_title character varying(255),
    default_manager_id uuid,
    send_welcome_email boolean DEFAULT true,
    welcome_email_subject character varying(500) DEFAULT 'Welcome to {{company_name}}'::character varying,
    welcome_email_body text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    timeline jsonb DEFAULT '[]'::jsonb
);


-- Name: COLUMN onboarding_templates.timeline; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.onboarding_templates.timeline IS 'Timeline of actions with triggers and offsets for lifecycle automation';


-- Name: organization_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.organization_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    key character varying(255) NOT NULL,
    value text,
    is_sensitive boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
-- Install-level key/value (NOT org-scoped). Home of `instance_id`, the stable
-- identity this install reports to the control plane. Keyed by `key` alone so it
-- survives org deletion. IF NOT EXISTS: this schema is applied whole on fresh
-- installs and must be safe if a partial schema already exists. See
-- migrations/007_add_system_settings.sql.

CREATE TABLE IF NOT EXISTS public.system_settings (
    key character varying(255) PRIMARY KEY,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: password_setup_tokens; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.password_setup_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: rule_evaluation_log; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.rule_evaluation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    rule_id uuid,
    rule_type character varying(50) NOT NULL,
    facts jsonb NOT NULL,
    matched boolean NOT NULL,
    result jsonb,
    triggered_by character varying(100),
    user_id uuid,
    evaluation_time_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: TABLE rule_evaluation_log; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.rule_evaluation_log IS 'Audit log of rule evaluations for debugging';


-- Name: scheduled_user_actions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.scheduled_user_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    target_email character varying(255),
    target_first_name character varying(255),
    target_last_name character varying(255),
    target_personal_email character varying(255),
    action_type character varying(50) NOT NULL,
    onboarding_template_id uuid,
    offboarding_template_id uuid,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    config_overrides jsonb DEFAULT '{}'::jsonb,
    scheduled_for timestamp with time zone NOT NULL,
    is_recurring boolean DEFAULT false,
    recurrence_interval character varying(50),
    recurrence_until timestamp with time zone,
    last_recurrence_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_steps integer DEFAULT 0,
    completed_steps integer DEFAULT 0,
    current_step character varying(100),
    error_message text,
    error_details jsonb,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    next_retry_at timestamp with time zone,
    requires_approval boolean DEFAULT false,
    approved_by uuid,
    approved_at timestamp with time zone,
    approval_notes text,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_reason text,
    depends_on_action_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    CONSTRAINT check_action_type CHECK (((action_type)::text = ANY ((ARRAY['onboard'::character varying, 'offboard'::character varying, 'suspend'::character varying, 'unsuspend'::character varying, 'delete'::character varying, 'restore'::character varying])::text[]))),
    CONSTRAINT check_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'skipped'::character varying])::text[])))
);


-- Name: security_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    event_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    source character varying(50),
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    is_resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: signature_assignments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    template_id uuid NOT NULL,
    assignment_type character varying(30) NOT NULL,
    target_id uuid,
    target_value character varying(500),
    priority integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT signature_assignments_assignment_type_check CHECK (((assignment_type)::text = ANY ((ARRAY['user'::character varying, 'group'::character varying, 'dynamic_group'::character varying, 'department'::character varying, 'ou'::character varying, 'organization'::character varying])::text[])))
);


-- Name: signature_campaigns; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_campaigns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    template_id uuid NOT NULL,
    banner_url character varying(500),
    banner_link character varying(500),
    banner_alt_text character varying(255),
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    timezone character varying(100) DEFAULT 'UTC'::character varying,
    tracking_enabled boolean DEFAULT true,
    tracking_options jsonb DEFAULT '{"geo": true, "opens": true, "unique": true}'::jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    auto_revert boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    launched_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT campaign_dates_valid CHECK ((end_date > start_date)),
    CONSTRAINT signature_campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


-- Name: signature_permissions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    permission_type character varying(50) NOT NULL,
    scope character varying(50) DEFAULT 'self'::character varying NOT NULL,
    target_id uuid,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: signature_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    html_content text NOT NULL,
    plain_text_content text,
    merge_fields jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false,
    is_campaign_template boolean DEFAULT false,
    status character varying(20) DEFAULT 'draft'::character varying,
    version integer DEFAULT 1,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT signature_templates_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying])::text[])))
);


-- Name: signature_tracking_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_tracking_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pixel_id uuid NOT NULL,
    campaign_id uuid,
    user_id uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    ip_address_hash character varying(64),
    user_agent text,
    country_code character varying(2),
    region character varying(100),
    city character varying(100),
    is_unique boolean DEFAULT false,
    device_type character varying(20),
    campaign_name character varying(255),
    tracking_type character varying(20) DEFAULT 'campaign'::character varying,
    user_tracking_id uuid,
    CONSTRAINT signature_tracking_events_tracking_type_check CHECK (((tracking_type)::text = ANY ((ARRAY['user'::character varying, 'campaign'::character varying])::text[])))
);


-- Name: signature_tracking_pixels; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_tracking_pixels (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pixel_token character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: signature_user_tracking; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signature_user_tracking (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    campaign_id uuid,
    template_id uuid,
    tracking_token character varying(100) NOT NULL,
    total_opens integer DEFAULT 0,
    unique_opens integer DEFAULT 0,
    last_open_at timestamp with time zone,
    first_open_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: smtp_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.smtp_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    host character varying(255) NOT NULL,
    port integer DEFAULT 587 NOT NULL,
    username character varying(255),
    password_encrypted text,
    from_email character varying(255) NOT NULL,
    from_name character varying(255),
    use_tls boolean DEFAULT true,
    is_active boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: sso_providers; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sso_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    provider_type text NOT NULL,
    provider_name text NOT NULL,
    display_name text,
    client_id text,
    client_secret text,
    issuer text,
    authorization_url text,
    token_url text,
    userinfo_url text,
    metadata_url text,
    scopes text DEFAULT 'openid profile email'::text,
    is_enabled boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: training_content; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.training_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    content_type character varying(50) NOT NULL,
    url text,
    file_path text,
    embedded_content text,
    estimated_duration_minutes integer DEFAULT 0,
    passing_score integer,
    requires_acknowledgment boolean DEFAULT false,
    requires_signature boolean DEFAULT false,
    allow_skip boolean DEFAULT false,
    category character varying(100),
    tags jsonb DEFAULT '[]'::jsonb,
    applies_to_roles jsonb DEFAULT '[]'::jsonb,
    applies_to_departments jsonb DEFAULT '[]'::jsonb,
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    is_mandatory boolean DEFAULT false,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


-- Name: TABLE training_content; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.training_content IS 'Training materials that can be assigned to users during onboarding or ongoing';


-- Name: COLUMN training_content.content_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.training_content.content_type IS 'Type of content: video, document, terms, quiz, link, checklist';


-- Name: training_quiz_questions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.training_quiz_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id uuid NOT NULL,
    question_text text NOT NULL,
    question_type character varying(20) DEFAULT 'single_choice'::character varying NOT NULL,
    options jsonb,
    correct_answer text,
    points integer DEFAULT 1,
    explanation text,
    sequence_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


-- Name: TABLE training_quiz_questions; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.training_quiz_questions IS 'Quiz questions for training content with type=quiz';


-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_addresses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    address_type character varying(50) DEFAULT 'work'::character varying,
    street_address_1 character varying(500),
    street_address_2 character varying(500),
    city character varying(255),
    state_province character varying(255),
    postal_code character varying(50),
    country character varying(100),
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: user_dashboard_widgets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_dashboard_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    widget_type character varying(50) NOT NULL,
    "position" integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: user_expertise_topics; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_expertise_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic character varying(100) NOT NULL,
    proficiency_level character varying(20) DEFAULT 'intermediate'::character varying,
    is_willing_to_help boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: user_field_visibility; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_field_visibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    field_name character varying(100) NOT NULL,
    visibility character varying(20) DEFAULT 'organization'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: user_fun_facts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_fun_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fact text NOT NULL,
    sort_order integer DEFAULT 0,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: user_group_memberships; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_group_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying,
    joined_at timestamp with time zone DEFAULT now()
);


-- Name: user_groups; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    email character varying(255),
    group_type character varying(50) DEFAULT 'security'::character varying,
    is_active boolean DEFAULT true,
    is_dynamic boolean DEFAULT false,
    is_system boolean DEFAULT false,
    google_group_id character varying(255),
    google_workspace_group_id character varying(255),
    microsoft_365_group_id character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: user_initial_passwords; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_initial_passwords (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_email character varying(255) NOT NULL,
    encrypted_password text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    revealed_at timestamp with time zone,
    revealed_by uuid,
    cleared_at timestamp with time zone,
    cleared_by uuid
);


-- Name: TABLE user_initial_passwords; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.user_initial_passwords IS 'Stores initial passwords for newly created users that admins can reveal. Cleared when user changes password.';


-- Name: user_interests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    interest character varying(100) NOT NULL,
    category character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


-- Name: user_lifecycle_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_lifecycle_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    action_id uuid,
    step_name character varying(100) NOT NULL,
    step_type character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    error_message text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: user_media; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    media_type character varying(50) NOT NULL,
    storage_type character varying(20) DEFAULT 'minio'::character varying NOT NULL,
    storage_path character varying(500) NOT NULL,
    original_filename character varying(255),
    mime_type character varying(100),
    size_bytes bigint,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: user_requests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    request_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    email character varying(255) NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    personal_email character varying(255),
    user_id uuid,
    start_date date,
    end_date date,
    template_id uuid,
    job_title character varying(255),
    department_id uuid,
    manager_id uuid,
    location character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    requested_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    tasks_total integer DEFAULT 0,
    tasks_completed integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['onboard'::character varying, 'offboard'::character varying, 'transfer'::character varying])::text[]))),
    CONSTRAINT user_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


-- Name: TABLE user_requests; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.user_requests IS 'Unified queue for onboard/offboard/transfer lifecycle requests';


-- Name: COLUMN user_requests.request_type; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.user_requests.request_type IS 'Type of request: onboard, offboard, or transfer';


-- Name: COLUMN user_requests.status; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.user_requests.status IS 'Request status: pending, approved, rejected, in_progress, completed, cancelled';


-- Name: COLUMN user_requests.personal_email; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.user_requests.personal_email IS 'Personal email for pre-start communications (before work email exists)';


-- Name: COLUMN user_requests.metadata; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.user_requests.metadata IS 'Additional custom data as JSON';


-- Name: user_secondary_emails; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_secondary_emails (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    email_type character varying(50) DEFAULT 'personal'::character varying,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used timestamp with time zone DEFAULT now(),
    ip_address inet,
    user_agent text
);


-- Name: user_signature_permissions; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.user_signature_permissions AS
 SELECT ou.id AS user_id,
    ou.organization_id,
    ou.email,
    ou.first_name,
    ou.last_name,
    COALESCE(
        CASE
            WHEN ((ou.role)::text = 'admin'::text) THEN 'admin'::text
            ELSE NULL::text
        END, (sp.permission_type)::text, 'viewer'::text) AS effective_permission,
    sp.permission_type AS explicit_permission,
    sp.granted_by,
    sp.granted_at,
    sp.expires_at,
    ((ou.role)::text = 'admin'::text) AS is_org_admin
   FROM (public.organization_users ou
     LEFT JOIN public.signature_permissions sp ON (((sp.user_id = ou.id) AND (sp.is_active = true) AND ((sp.expires_at IS NULL) OR (sp.expires_at > now())))));


-- Name: user_signature_status; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_signature_status (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    current_template_id uuid,
    active_campaign_id uuid,
    assignment_source character varying(50),
    assignment_id uuid,
    rendered_html text,
    last_synced_at timestamp with time zone,
    sync_status character varying(20) DEFAULT 'pending'::character varying,
    sync_error text,
    google_signature_hash character varying(64),
    sync_attempts integer DEFAULT 0,
    last_sync_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_signature_status_sync_status_check CHECK (((sync_status)::text = ANY ((ARRAY['pending'::character varying, 'syncing'::character varying, 'synced'::character varying, 'failed'::character varying, 'error'::character varying, 'skipped'::character varying])::text[])))
);


-- Name: user_training_progress; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_training_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content_id uuid NOT NULL,
    status character varying(20) DEFAULT 'not_started'::character varying NOT NULL,
    progress_percent integer DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    time_spent_seconds integer DEFAULT 0,
    quiz_attempts integer DEFAULT 0,
    quiz_score integer,
    quiz_passed boolean,
    quiz_answers jsonb,
    acknowledged_at timestamp without time zone,
    signature_data text,
    signature_ip character varying(45),
    signature_user_agent text,
    assigned_at timestamp without time zone DEFAULT now(),
    assigned_by uuid,
    due_date date,
    request_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


-- Name: workflows; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    trigger_type character varying(50) NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    steps jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    joined_at timestamp with time zone DEFAULT now(),
    removed_at timestamp with time zone,
    synced_from_platform boolean DEFAULT true
);


-- Name: workspaces; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    email character varying(255),
    platform character varying(50) NOT NULL,
    external_id character varying(255),
    external_url character varying(500),
    workspace_type character varying(50),
    is_active boolean DEFAULT true,
    is_archived boolean DEFAULT false,
    archived_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone
);


-- Name: access_group_members access_group_members_access_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_access_group_id_user_id_key UNIQUE (access_group_id, user_id);


-- Name: access_group_members access_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_pkey PRIMARY KEY (id);


-- Name: access_groups access_groups_organization_id_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_organization_id_platform_external_id_key UNIQUE (organization_id, platform, external_id);


-- Name: access_groups access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_pkey PRIMARY KEY (id);


-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


-- Name: ai_chat_history ai_chat_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_pkey PRIMARY KEY (id);


-- Name: ai_config ai_config_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_organization_id_key UNIQUE (organization_id);


-- Name: ai_config ai_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_pkey PRIMARY KEY (id);


-- Name: ai_usage_log ai_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_pkey PRIMARY KEY (id);


-- Name: api_key_usage_logs api_key_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_pkey PRIMARY KEY (id);


-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


-- Name: auth_accounts auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);


-- Name: auth_accounts auth_accounts_provider_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_provider_id_account_id_key UNIQUE (provider_id, account_id);


-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


-- Name: auth_sessions auth_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_token_key UNIQUE (token);


-- Name: auth_verifications auth_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_verifications
    ADD CONSTRAINT auth_verifications_pkey PRIMARY KEY (id);


-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


-- Name: available_modules available_modules_module_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.available_modules
    ADD CONSTRAINT available_modules_module_key_key UNIQUE (module_key);


-- Name: available_modules available_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.available_modules
    ADD CONSTRAINT available_modules_pkey PRIMARY KEY (id);


-- Name: available_modules available_modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.available_modules
    ADD CONSTRAINT available_modules_slug_key UNIQUE (slug);


-- Name: bulk_operations bulk_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_pkey PRIMARY KEY (id);


-- Name: campaign_assignments campaign_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_assignments
    ADD CONSTRAINT campaign_assignments_pkey PRIMARY KEY (id);


-- Name: cost_centers cost_centers_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_organization_id_code_key UNIQUE (organization_id, code);


-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


-- Name: custom_field_definitions custom_field_definitions_organization_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_organization_id_field_key_key UNIQUE (organization_id, field_key);


-- Name: custom_field_definitions custom_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);


-- Name: custom_field_values custom_field_values_definition_id_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_definition_id_entity_id_key UNIQUE (definition_id, entity_id);


-- Name: custom_field_values custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_pkey PRIMARY KEY (id);


-- Name: custom_labels custom_labels_organization_id_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_organization_id_canonical_name_key UNIQUE (organization_id, canonical_name);


-- Name: custom_labels custom_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_pkey PRIMARY KEY (id);


-- Name: departments departments_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_name_key UNIQUE (organization_id, name);


-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


-- Name: dynamic_group_rules dynamic_group_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.dynamic_group_rules
    ADD CONSTRAINT dynamic_group_rules_pkey PRIMARY KEY (id);


-- Name: email_templates email_templates_organization_id_template_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_organization_id_template_key_key UNIQUE (organization_id, template_key);


-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


-- Name: feature_flags feature_flags_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_feature_key_key UNIQUE (feature_key);


-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


-- Name: gw_credentials gw_credentials_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_organization_id_key UNIQUE (organization_id);


-- Name: gw_credentials gw_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_pkey PRIMARY KEY (id);


-- Name: gw_groups gw_groups_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_organization_id_google_id_key UNIQUE (organization_id, google_id);


-- Name: gw_groups gw_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_pkey PRIMARY KEY (id);


-- Name: gw_org_units gw_org_units_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_organization_id_google_id_key UNIQUE (organization_id, google_id);


-- Name: gw_org_units gw_org_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_pkey PRIMARY KEY (id);


-- Name: gw_synced_users gw_synced_users_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_organization_id_google_id_key UNIQUE (organization_id, google_id);


-- Name: gw_synced_users gw_synced_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_pkey PRIMARY KEY (id);


-- Name: helpdesk_tickets helpdesk_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_pkey PRIMARY KEY (id);


-- Name: job_titles job_titles_organization_id_title_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_organization_id_title_key UNIQUE (organization_id, title);


-- Name: job_titles job_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_pkey PRIMARY KEY (id);


-- Name: lifecycle_tasks lifecycle_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_pkey PRIMARY KEY (id);


-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


-- Name: master_data_settings master_data_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.master_data_settings
    ADD CONSTRAINT master_data_settings_pkey PRIMARY KEY (organization_id);


-- Name: media_asset_folders media_asset_folders_organization_id_path_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_folders
    ADD CONSTRAINT media_asset_folders_organization_id_path_key UNIQUE (organization_id, path);


-- Name: media_asset_folders media_asset_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_folders
    ADD CONSTRAINT media_asset_folders_pkey PRIMARY KEY (id);


-- Name: media_asset_settings media_asset_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_settings
    ADD CONSTRAINT media_asset_settings_pkey PRIMARY KEY (organization_id);


-- Name: media_assets media_assets_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_access_token_key UNIQUE (access_token);


-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


-- Name: module_entity_providers module_entity_providers_module_key_entity_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.module_entity_providers
    ADD CONSTRAINT module_entity_providers_module_key_entity_canonical_name_key UNIQUE (module_key, entity_canonical_name);


-- Name: module_entity_providers module_entity_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.module_entity_providers
    ADD CONSTRAINT module_entity_providers_pkey PRIMARY KEY (id);


-- Name: modules modules_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_name_key UNIQUE (name);


-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


-- Name: modules modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_slug_key UNIQUE (slug);


-- Name: ms_credentials ms_credentials_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_credentials
    ADD CONSTRAINT ms_credentials_organization_id_key UNIQUE (organization_id);


-- Name: ms_credentials ms_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_credentials
    ADD CONSTRAINT ms_credentials_pkey PRIMARY KEY (id);


-- Name: ms_group_memberships ms_group_memberships_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_group_memberships
    ADD CONSTRAINT ms_group_memberships_group_id_user_id_key UNIQUE (group_id, user_id);


-- Name: ms_group_memberships ms_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_group_memberships
    ADD CONSTRAINT ms_group_memberships_pkey PRIMARY KEY (id);


-- Name: ms_licenses ms_licenses_organization_id_sku_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_licenses
    ADD CONSTRAINT ms_licenses_organization_id_sku_id_key UNIQUE (organization_id, sku_id);


-- Name: ms_licenses ms_licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_licenses
    ADD CONSTRAINT ms_licenses_pkey PRIMARY KEY (id);


-- Name: ms_synced_groups ms_synced_groups_organization_id_ms_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_groups
    ADD CONSTRAINT ms_synced_groups_organization_id_ms_id_key UNIQUE (organization_id, ms_id);


-- Name: ms_synced_groups ms_synced_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_groups
    ADD CONSTRAINT ms_synced_groups_pkey PRIMARY KEY (id);


-- Name: ms_synced_users ms_synced_users_organization_id_ms_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_users
    ADD CONSTRAINT ms_synced_users_organization_id_ms_id_key UNIQUE (organization_id, ms_id);


-- Name: ms_synced_users ms_synced_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_users
    ADD CONSTRAINT ms_synced_users_pkey PRIMARY KEY (id);


-- Name: named_conditions named_conditions_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.named_conditions
    ADD CONSTRAINT named_conditions_organization_id_name_key UNIQUE (organization_id, name);


-- Name: named_conditions named_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.named_conditions
    ADD CONSTRAINT named_conditions_pkey PRIMARY KEY (id);


-- Name: offboarding_templates offboarding_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.offboarding_templates
    ADD CONSTRAINT offboarding_templates_pkey PRIMARY KEY (id);


-- Name: onboarding_templates onboarding_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_pkey PRIMARY KEY (id);


-- Name: organization_modules organization_modules_organization_id_module_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_organization_id_module_id_key UNIQUE (organization_id, module_id);


-- Name: organization_modules organization_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_pkey PRIMARY KEY (id);


-- Name: organization_settings organization_settings_organization_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_organization_id_key_key UNIQUE (organization_id, key);


-- Name: organization_settings organization_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (id);


-- Name: organization_users organization_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_email_key UNIQUE (email);


-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


-- Name: password_setup_tokens password_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_pkey PRIMARY KEY (id);


-- Name: password_setup_tokens password_setup_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_token_key UNIQUE (token);


-- Name: rule_evaluation_log rule_evaluation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rule_evaluation_log
    ADD CONSTRAINT rule_evaluation_log_pkey PRIMARY KEY (id);


-- Name: scheduled_user_actions scheduled_user_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_pkey PRIMARY KEY (id);


-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


-- Name: signature_assignments signature_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_pkey PRIMARY KEY (id);


-- Name: signature_campaigns signature_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_pkey PRIMARY KEY (id);


-- Name: signature_permissions signature_permissions_organization_id_user_id_permission_ty_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_permissions
    ADD CONSTRAINT signature_permissions_organization_id_user_id_permission_ty_key UNIQUE (organization_id, user_id, permission_type, scope, target_id);


-- Name: signature_permissions signature_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_permissions
    ADD CONSTRAINT signature_permissions_pkey PRIMARY KEY (id);


-- Name: signature_templates signature_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_pkey PRIMARY KEY (id);


-- Name: signature_tracking_events signature_tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_events
    ADD CONSTRAINT signature_tracking_events_pkey PRIMARY KEY (id);


-- Name: signature_tracking_pixels signature_tracking_pixels_pixel_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_pixels
    ADD CONSTRAINT signature_tracking_pixels_pixel_token_key UNIQUE (pixel_token);


-- Name: signature_tracking_pixels signature_tracking_pixels_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_pixels
    ADD CONSTRAINT signature_tracking_pixels_pkey PRIMARY KEY (id);


-- Name: signature_user_tracking signature_user_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_pkey PRIMARY KEY (id);


-- Name: signature_user_tracking signature_user_tracking_tracking_token_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_tracking_token_key UNIQUE (tracking_token);


-- Name: smtp_settings smtp_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_organization_id_key UNIQUE (organization_id);


-- Name: smtp_settings smtp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_pkey PRIMARY KEY (id);


-- Name: sso_providers sso_providers_organization_id_provider_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT sso_providers_organization_id_provider_name_key UNIQUE (organization_id, provider_name);


-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


-- Name: signature_tracking_pixels tracking_pixels_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_pixels
    ADD CONSTRAINT tracking_pixels_unique UNIQUE (campaign_id, user_id);


-- Name: training_content training_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.training_content
    ADD CONSTRAINT training_content_pkey PRIMARY KEY (id);


-- Name: training_quiz_questions training_quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.training_quiz_questions
    ADD CONSTRAINT training_quiz_questions_pkey PRIMARY KEY (id);


-- Name: user_initial_passwords unique_active_initial_password; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT unique_active_initial_password UNIQUE (organization_id, user_email);


-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


-- Name: user_assets user_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_pkey PRIMARY KEY (id);


-- Name: user_dashboard_widgets user_dashboard_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_dashboard_widgets
    ADD CONSTRAINT user_dashboard_widgets_pkey PRIMARY KEY (id);


-- Name: user_expertise_topics user_expertise_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_expertise_topics
    ADD CONSTRAINT user_expertise_topics_pkey PRIMARY KEY (id);


-- Name: user_field_visibility user_field_visibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_field_visibility
    ADD CONSTRAINT user_field_visibility_pkey PRIMARY KEY (id);


-- Name: user_field_visibility user_field_visibility_user_id_field_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_field_visibility
    ADD CONSTRAINT user_field_visibility_user_id_field_name_key UNIQUE (user_id, field_name);


-- Name: user_fun_facts user_fun_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_fun_facts
    ADD CONSTRAINT user_fun_facts_pkey PRIMARY KEY (id);


-- Name: user_group_memberships user_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_pkey PRIMARY KEY (id);


-- Name: user_group_memberships user_group_memberships_user_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_user_id_group_id_key UNIQUE (user_id, group_id);


-- Name: user_groups user_groups_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_organization_id_name_key UNIQUE (organization_id, name);


-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


-- Name: user_initial_passwords user_initial_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT user_initial_passwords_pkey PRIMARY KEY (id);


-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


-- Name: user_lifecycle_logs user_lifecycle_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_lifecycle_logs
    ADD CONSTRAINT user_lifecycle_logs_pkey PRIMARY KEY (id);


-- Name: user_media user_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_media
    ADD CONSTRAINT user_media_pkey PRIMARY KEY (id);


-- Name: user_requests user_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_pkey PRIMARY KEY (id);


-- Name: user_secondary_emails user_secondary_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_pkey PRIMARY KEY (id);


-- Name: user_secondary_emails user_secondary_emails_user_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_user_id_email_key UNIQUE (user_id, email);


-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


-- Name: user_signature_status user_signature_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_pkey PRIMARY KEY (id);


-- Name: user_signature_status user_signature_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_user_id_key UNIQUE (user_id);


-- Name: user_training_progress user_training_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_pkey PRIMARY KEY (id);


-- Name: user_training_progress user_training_progress_user_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_user_id_content_id_key UNIQUE (user_id, content_id);


-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


-- Name: workspace_members workspace_members_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


-- Name: workspaces workspaces_organization_id_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_organization_id_platform_external_id_key UNIQUE (organization_id, platform, external_id);


-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


-- Name: idx_access_group_members_group; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (access_group_id);


-- Name: idx_access_group_members_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);


-- Name: idx_access_groups_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_groups_active ON public.access_groups USING btree (organization_id, is_active) WHERE (is_active = true);


-- Name: idx_access_groups_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_groups_email ON public.access_groups USING btree (email);


-- Name: idx_access_groups_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_groups_org ON public.access_groups USING btree (organization_id);


-- Name: idx_access_groups_platform; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_access_groups_platform ON public.access_groups USING btree (platform, external_id);


-- Name: idx_activity_logs_action; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_action ON public.activity_logs USING btree (action);


-- Name: idx_activity_logs_actor; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_actor ON public.activity_logs USING btree (actor_id) WHERE (actor_id IS NOT NULL);


-- Name: idx_activity_logs_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_created ON public.activity_logs USING btree (created_at DESC);


-- Name: idx_activity_logs_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_org ON public.activity_logs USING btree (organization_id);


-- Name: idx_activity_logs_resource; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_resource ON public.activity_logs USING btree (resource_type, resource_id) WHERE (resource_type IS NOT NULL);


-- Name: idx_activity_logs_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_user ON public.activity_logs USING btree (user_id) WHERE (user_id IS NOT NULL);


-- Name: idx_activity_logs_user_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_activity_logs_user_created ON public.activity_logs USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


-- Name: idx_ai_chat_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_chat_org ON public.ai_chat_history USING btree (organization_id, created_at);


-- Name: idx_ai_chat_session; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_chat_session ON public.ai_chat_history USING btree (session_id, created_at);


-- Name: idx_ai_chat_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_chat_user ON public.ai_chat_history USING btree (user_id, created_at);


-- Name: idx_ai_usage_model; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_usage_model ON public.ai_usage_log USING btree (model_used, created_at);


-- Name: idx_ai_usage_org_date; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_usage_org_date ON public.ai_usage_log USING btree (organization_id, created_at);


-- Name: idx_ai_usage_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ai_usage_user ON public.ai_usage_log USING btree (user_id, created_at);


-- Name: idx_api_key_usage_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_api_key_usage_created ON public.api_key_usage_logs USING btree (created_at);


-- Name: idx_api_key_usage_key; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_api_key_usage_key ON public.api_key_usage_logs USING btree (api_key_id);


-- Name: idx_api_keys_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (is_active);


-- Name: idx_api_keys_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_api_keys_org ON public.api_keys USING btree (organization_id);


-- Name: idx_api_keys_prefix; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix);


-- Name: idx_assets_asset_tag; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_assets_asset_tag ON public.assets USING btree (asset_tag);


-- Name: idx_assets_custom_fields; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_assets_custom_fields ON public.assets USING gin (custom_fields);


-- Name: idx_assets_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_assets_org_id ON public.assets USING btree (organization_id);


-- Name: idx_assets_serial_number; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_assets_serial_number ON public.assets USING btree (serial_number);


-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


-- Name: idx_audit_logs_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_audit_logs_org_id ON public.audit_logs USING btree (organization_id);


-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


-- Name: idx_auth_accounts_provider; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_accounts_provider ON public.auth_accounts USING btree (provider_id);


-- Name: idx_auth_accounts_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_accounts_user_id ON public.auth_accounts USING btree (user_id);


-- Name: idx_auth_sessions_expires_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_sessions_expires_at ON public.auth_sessions USING btree (expires_at);


-- Name: idx_auth_sessions_token; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_sessions_token ON public.auth_sessions USING btree (token);


-- Name: idx_auth_sessions_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_sessions_user_id ON public.auth_sessions USING btree (user_id);


-- Name: idx_auth_verifications_expires_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_verifications_expires_at ON public.auth_verifications USING btree (expires_at);


-- Name: idx_auth_verifications_identifier; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_auth_verifications_identifier ON public.auth_verifications USING btree (identifier);


-- Name: idx_automation_rules_enabled; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_automation_rules_enabled ON public.automation_rules USING btree (organization_id, is_enabled, rule_type);


-- Name: idx_automation_rules_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_automation_rules_org ON public.automation_rules USING btree (organization_id);


-- Name: idx_automation_rules_priority; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_automation_rules_priority ON public.automation_rules USING btree (organization_id, rule_type, priority DESC);


-- Name: idx_automation_rules_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_automation_rules_type ON public.automation_rules USING btree (organization_id, rule_type);


-- Name: idx_bulk_operations_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_bulk_operations_org ON public.bulk_operations USING btree (organization_id);


-- Name: idx_bulk_operations_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_bulk_operations_status ON public.bulk_operations USING btree (status);


-- Name: idx_campaign_assignments_campaign; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_campaign_assignments_campaign ON public.campaign_assignments USING btree (campaign_id);


-- Name: idx_campaign_assignments_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_campaign_assignments_unique ON public.campaign_assignments USING btree (campaign_id, assignment_type, target_id) WHERE (target_id IS NOT NULL);


-- Name: idx_campaign_assignments_unique_org; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_campaign_assignments_unique_org ON public.campaign_assignments USING btree (campaign_id, assignment_type) WHERE ((assignment_type)::text = 'organization'::text);


-- Name: idx_campaign_assignments_unique_value; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_campaign_assignments_unique_value ON public.campaign_assignments USING btree (campaign_id, assignment_type, target_value) WHERE ((target_value IS NOT NULL) AND (target_id IS NULL));


-- Name: idx_cost_centers_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_cost_centers_active ON public.cost_centers USING btree (is_active);


-- Name: idx_cost_centers_code; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_cost_centers_code ON public.cost_centers USING btree (code);


-- Name: idx_cost_centers_department; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_cost_centers_department ON public.cost_centers USING btree (department_id);


-- Name: idx_cost_centers_organization; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_cost_centers_organization ON public.cost_centers USING btree (organization_id);


-- Name: idx_custom_field_defs_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_custom_field_defs_org ON public.custom_field_definitions USING btree (organization_id);


-- Name: idx_custom_field_values_def; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_custom_field_values_def ON public.custom_field_values USING btree (definition_id);


-- Name: idx_custom_field_values_entity; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_custom_field_values_entity ON public.custom_field_values USING btree (entity_id, entity_type);


-- Name: idx_custom_labels_canonical; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_custom_labels_canonical ON public.custom_labels USING btree (canonical_name);


-- Name: idx_custom_labels_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_custom_labels_org ON public.custom_labels USING btree (organization_id);


-- Name: idx_departments_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_departments_active ON public.departments USING btree (is_active);


-- Name: idx_departments_org_unit; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_departments_org_unit ON public.departments USING btree (org_unit_id);


-- Name: idx_departments_organization; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_departments_organization ON public.departments USING btree (organization_id);


-- Name: idx_departments_parent; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_departments_parent ON public.departments USING btree (parent_department_id);


-- Name: idx_dynamic_group_rules_group; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_dynamic_group_rules_group ON public.dynamic_group_rules USING btree (group_id);


-- Name: idx_feature_flags_category; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_feature_flags_category ON public.feature_flags USING btree (category);


-- Name: idx_feature_flags_key; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_feature_flags_key ON public.feature_flags USING btree (feature_key);


-- Name: idx_gw_credentials_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_credentials_org_id ON public.gw_credentials USING btree (organization_id);


-- Name: idx_gw_groups_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_groups_email ON public.gw_groups USING btree (organization_id, email);


-- Name: idx_gw_groups_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_groups_org_id ON public.gw_groups USING btree (organization_id);


-- Name: idx_gw_org_units_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_org_units_org_id ON public.gw_org_units USING btree (organization_id);


-- Name: idx_gw_org_units_parent; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_org_units_parent ON public.gw_org_units USING btree (organization_id, parent_id);


-- Name: idx_gw_org_units_path; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_org_units_path ON public.gw_org_units USING btree (organization_id, path);


-- Name: idx_gw_synced_users_department; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_synced_users_department ON public.gw_synced_users USING btree (organization_id, department);


-- Name: idx_gw_synced_users_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_synced_users_email ON public.gw_synced_users USING btree (organization_id, email);


-- Name: idx_gw_synced_users_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_synced_users_org_id ON public.gw_synced_users USING btree (organization_id);


-- Name: idx_gw_synced_users_org_unit; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_synced_users_org_unit ON public.gw_synced_users USING btree (organization_id, org_unit_path);


-- Name: idx_gw_synced_users_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_gw_synced_users_status ON public.gw_synced_users USING btree (organization_id, is_suspended);


-- Name: idx_helpdesk_tickets_assigned; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_helpdesk_tickets_assigned ON public.helpdesk_tickets USING btree (assigned_to);


-- Name: idx_helpdesk_tickets_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_helpdesk_tickets_org ON public.helpdesk_tickets USING btree (organization_id);


-- Name: idx_helpdesk_tickets_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_helpdesk_tickets_status ON public.helpdesk_tickets USING btree (status);


-- Name: idx_helpdesk_tickets_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_helpdesk_tickets_user ON public.helpdesk_tickets USING btree (user_id);


-- Name: idx_initial_passwords_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_initial_passwords_org ON public.user_initial_passwords USING btree (organization_id);


-- Name: idx_initial_passwords_org_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_initial_passwords_org_email ON public.user_initial_passwords USING btree (organization_id, user_email);


-- Name: idx_job_titles_dept; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_job_titles_dept ON public.job_titles USING btree (department_id);


-- Name: idx_job_titles_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_job_titles_org ON public.job_titles USING btree (organization_id);


-- Name: idx_lifecycle_logs_action; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_logs_action ON public.user_lifecycle_logs USING btree (action_id);


-- Name: idx_lifecycle_logs_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_logs_org ON public.user_lifecycle_logs USING btree (organization_id);


-- Name: idx_lifecycle_logs_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_logs_user ON public.user_lifecycle_logs USING btree (user_id);


-- Name: idx_lifecycle_tasks_assignee; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_assignee ON public.lifecycle_tasks USING btree (assignee_id) WHERE (assignee_id IS NOT NULL);


-- Name: idx_lifecycle_tasks_assignee_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_assignee_type ON public.lifecycle_tasks USING btree (organization_id, assignee_type, status);


-- Name: idx_lifecycle_tasks_due_date; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_due_date ON public.lifecycle_tasks USING btree (due_date) WHERE ((status)::text = 'pending'::text);


-- Name: idx_lifecycle_tasks_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_org ON public.lifecycle_tasks USING btree (organization_id);


-- Name: idx_lifecycle_tasks_request; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_request ON public.lifecycle_tasks USING btree (request_id);


-- Name: idx_lifecycle_tasks_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_status ON public.lifecycle_tasks USING btree (organization_id, status);


-- Name: idx_lifecycle_tasks_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lifecycle_tasks_user ON public.lifecycle_tasks USING btree (user_id) WHERE (user_id IS NOT NULL);


-- Name: idx_locations_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_active ON public.locations USING btree (is_active);


-- Name: idx_locations_country; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_country ON public.locations USING btree (country);


-- Name: idx_locations_organization; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_organization ON public.locations USING btree (organization_id);


-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_parent ON public.locations USING btree (parent_id);


-- Name: idx_locations_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_locations_type ON public.locations USING btree (type);


-- Name: idx_media_asset_folders_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_asset_folders_org ON public.media_asset_folders USING btree (organization_id);


-- Name: idx_media_asset_folders_parent; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_asset_folders_parent ON public.media_asset_folders USING btree (parent_id);


-- Name: idx_media_assets_category; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_assets_category ON public.media_assets USING btree (organization_id, category);


-- Name: idx_media_assets_folder; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_assets_folder ON public.media_assets USING btree (folder_id);


-- Name: idx_media_assets_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_assets_org ON public.media_assets USING btree (organization_id);


-- Name: idx_media_assets_token; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_media_assets_token ON public.media_assets USING btree (access_token);


-- Name: idx_module_entity_providers_entity; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_module_entity_providers_entity ON public.module_entity_providers USING btree (entity_canonical_name);


-- Name: idx_module_entity_providers_module; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_module_entity_providers_module ON public.module_entity_providers USING btree (module_key);


-- Name: idx_ms_credentials_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_credentials_org ON public.ms_credentials USING btree (organization_id);


-- Name: idx_ms_group_memberships_group; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_group_memberships_group ON public.ms_group_memberships USING btree (group_id);


-- Name: idx_ms_group_memberships_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_group_memberships_user ON public.ms_group_memberships USING btree (user_id);


-- Name: idx_ms_licenses_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_licenses_org ON public.ms_licenses USING btree (organization_id);


-- Name: idx_ms_synced_groups_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_synced_groups_org ON public.ms_synced_groups USING btree (organization_id);


-- Name: idx_ms_synced_users_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_synced_users_email ON public.ms_synced_users USING btree (email);


-- Name: idx_ms_synced_users_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_synced_users_org ON public.ms_synced_users USING btree (organization_id);


-- Name: idx_ms_synced_users_upn; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_ms_synced_users_upn ON public.ms_synced_users USING btree (upn);


-- Name: idx_named_conditions_name; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_named_conditions_name ON public.named_conditions USING btree (organization_id, name);


-- Name: idx_named_conditions_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_named_conditions_org ON public.named_conditions USING btree (organization_id);


-- Name: idx_offboarding_templates_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_offboarding_templates_active ON public.offboarding_templates USING btree (organization_id, is_active) WHERE (is_active = true);


-- Name: idx_offboarding_templates_one_default; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_offboarding_templates_one_default ON public.offboarding_templates USING btree (organization_id) WHERE (is_default = true);


-- Name: idx_offboarding_templates_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_offboarding_templates_org ON public.offboarding_templates USING btree (organization_id);


-- Name: idx_onboarding_templates_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_onboarding_templates_active ON public.onboarding_templates USING btree (organization_id, is_active) WHERE (is_active = true);


-- Name: idx_onboarding_templates_department; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_onboarding_templates_department ON public.onboarding_templates USING btree (department_id) WHERE (department_id IS NOT NULL);


-- Name: idx_onboarding_templates_one_default; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_onboarding_templates_one_default ON public.onboarding_templates USING btree (organization_id) WHERE (is_default = true);


-- Name: idx_onboarding_templates_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_onboarding_templates_org ON public.onboarding_templates USING btree (organization_id);


-- Name: idx_org_modules_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_modules_org_id ON public.organization_modules USING btree (organization_id);


-- Name: idx_org_users_cost_center_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_cost_center_id ON public.organization_users USING btree (cost_center_id);


-- Name: idx_org_users_custom_fields; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_custom_fields ON public.organization_users USING gin (custom_fields);


-- Name: idx_org_users_department; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_department ON public.organization_users USING btree (department);


-- Name: idx_org_users_department_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_department_id ON public.organization_users USING btree (department_id);


-- Name: idx_org_users_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_email ON public.organization_users USING btree (email);


-- Name: idx_org_users_employee_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_employee_id ON public.organization_users USING btree (employee_id);


-- Name: idx_org_users_google_workspace_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_google_workspace_id ON public.organization_users USING btree (google_workspace_id);


-- Name: idx_org_users_guest; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_guest ON public.organization_users USING btree (is_guest) WHERE (is_guest = true);


-- Name: idx_org_users_guest_expired; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_guest_expired ON public.organization_users USING btree (guest_expires_at) WHERE ((is_guest = true) AND (guest_expires_at IS NOT NULL));


-- Name: idx_org_users_location; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_location ON public.organization_users USING btree (location);


-- Name: idx_org_users_location_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_location_id ON public.organization_users USING btree (location_id);


-- Name: idx_org_users_ms_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_ms_id ON public.organization_users USING btree (microsoft_365_id) WHERE (microsoft_365_id IS NOT NULL);


-- Name: idx_org_users_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_org_id ON public.organization_users USING btree (organization_id);


-- Name: idx_org_users_reporting_manager; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_reporting_manager ON public.organization_users USING btree (reporting_manager_id);


-- Name: idx_org_users_role; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_org_users_role ON public.organization_users USING btree (role);


-- Name: idx_quiz_questions_content; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_quiz_questions_content ON public.training_quiz_questions USING btree (content_id);


-- Name: idx_rule_eval_log_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_rule_eval_log_org ON public.rule_evaluation_log USING btree (organization_id, created_at DESC);


-- Name: idx_rule_eval_log_rule; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_rule_eval_log_rule ON public.rule_evaluation_log USING btree (rule_id, created_at DESC);


-- Name: idx_scheduled_actions_approval; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_approval ON public.scheduled_user_actions USING btree (organization_id, requires_approval, status) WHERE ((requires_approval = true) AND ((status)::text = 'pending'::text) AND (approved_at IS NULL));


-- Name: idx_scheduled_actions_in_progress; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_in_progress ON public.scheduled_user_actions USING btree (organization_id, started_at) WHERE ((status)::text = 'in_progress'::text);


-- Name: idx_scheduled_actions_pending; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_pending ON public.scheduled_user_actions USING btree (organization_id, scheduled_for, status) WHERE ((status)::text = 'pending'::text);


-- Name: idx_scheduled_actions_retry; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_retry ON public.scheduled_user_actions USING btree (next_retry_at, retry_count) WHERE (((status)::text = 'failed'::text) AND (retry_count < max_retries));


-- Name: idx_scheduled_actions_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_status ON public.scheduled_user_actions USING btree (organization_id, status, scheduled_for);


-- Name: idx_scheduled_actions_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_scheduled_actions_user ON public.scheduled_user_actions USING btree (user_id, scheduled_for DESC) WHERE (user_id IS NOT NULL);


-- Name: idx_security_events_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_created ON public.security_events USING btree (created_at DESC);


-- Name: idx_security_events_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_org ON public.security_events USING btree (organization_id);


-- Name: idx_security_events_severity; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_severity ON public.security_events USING btree (severity);


-- Name: idx_security_events_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_type ON public.security_events USING btree (event_type);


-- Name: idx_security_events_unresolved; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_unresolved ON public.security_events USING btree (organization_id, is_resolved) WHERE (is_resolved = false);


-- Name: idx_security_events_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_security_events_user ON public.security_events USING btree (user_id);


-- Name: idx_sig_permissions_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sig_permissions_org ON public.signature_permissions USING btree (organization_id);


-- Name: idx_sig_permissions_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sig_permissions_user ON public.signature_permissions USING btree (user_id);


-- Name: idx_sig_user_tracking_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sig_user_tracking_org ON public.signature_user_tracking USING btree (organization_id);


-- Name: idx_sig_user_tracking_token; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sig_user_tracking_token ON public.signature_user_tracking USING btree (tracking_token);


-- Name: idx_sig_user_tracking_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sig_user_tracking_user ON public.signature_user_tracking USING btree (user_id);


-- Name: idx_signature_assignments_priority; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_assignments_priority ON public.signature_assignments USING btree (organization_id, is_active, priority);


-- Name: idx_signature_assignments_template; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_assignments_template ON public.signature_assignments USING btree (template_id);


-- Name: idx_signature_assignments_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_signature_assignments_unique ON public.signature_assignments USING btree (organization_id, template_id, assignment_type, target_id) WHERE (target_id IS NOT NULL);


-- Name: idx_signature_assignments_unique_org; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_signature_assignments_unique_org ON public.signature_assignments USING btree (organization_id, template_id, assignment_type) WHERE ((assignment_type)::text = 'organization'::text);


-- Name: idx_signature_assignments_unique_value; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_signature_assignments_unique_value ON public.signature_assignments USING btree (organization_id, template_id, assignment_type, target_value) WHERE ((target_value IS NOT NULL) AND (target_id IS NULL));


-- Name: idx_signature_campaigns_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_campaigns_active ON public.signature_campaigns USING btree (organization_id, start_date, end_date) WHERE ((status)::text = 'active'::text);


-- Name: idx_signature_campaigns_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_campaigns_org ON public.signature_campaigns USING btree (organization_id);


-- Name: idx_signature_campaigns_schedule; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_campaigns_schedule ON public.signature_campaigns USING btree (status, start_date, end_date) WHERE ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying])::text[]));


-- Name: idx_signature_campaigns_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_campaigns_status ON public.signature_campaigns USING btree (organization_id, status);


-- Name: idx_signature_templates_default; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_signature_templates_default ON public.signature_templates USING btree (organization_id) WHERE (is_default = true);


-- Name: idx_signature_templates_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_templates_org ON public.signature_templates USING btree (organization_id);


-- Name: idx_signature_templates_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signature_templates_status ON public.signature_templates USING btree (organization_id, status);


-- Name: idx_sso_providers_enabled; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sso_providers_enabled ON public.sso_providers USING btree (organization_id, is_enabled);


-- Name: idx_sso_providers_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_sso_providers_org_id ON public.sso_providers USING btree (organization_id);


-- Name: idx_tracking_events_campaign; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_tracking_events_campaign ON public.signature_tracking_events USING btree (campaign_id, "timestamp");


-- Name: idx_tracking_events_time; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_tracking_events_time ON public.signature_tracking_events USING btree ("timestamp");


-- Name: idx_tracking_events_unique; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_tracking_events_unique ON public.signature_tracking_events USING btree (campaign_id, is_unique) WHERE (is_unique = true);


-- Name: idx_tracking_events_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_tracking_events_user ON public.signature_tracking_events USING btree (user_id, "timestamp");


-- Name: idx_tracking_pixels_token; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_tracking_pixels_token ON public.signature_tracking_pixels USING btree (pixel_token);


-- Name: idx_training_content_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_content_active ON public.training_content USING btree (organization_id, is_active);


-- Name: idx_training_content_category; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_content_category ON public.training_content USING btree (organization_id, category);


-- Name: idx_training_content_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_content_org ON public.training_content USING btree (organization_id);


-- Name: idx_training_content_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_content_type ON public.training_content USING btree (organization_id, content_type);


-- Name: idx_training_progress_content; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_progress_content ON public.user_training_progress USING btree (content_id);


-- Name: idx_training_progress_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_progress_status ON public.user_training_progress USING btree (organization_id, status);


-- Name: idx_training_progress_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_training_progress_user ON public.user_training_progress USING btree (organization_id, user_id);


-- Name: idx_user_addresses_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_addresses_user_id ON public.user_addresses USING btree (user_id);


-- Name: idx_user_assets_asset_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_assets_asset_id ON public.user_assets USING btree (asset_id);


-- Name: idx_user_assets_is_primary; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_assets_is_primary ON public.user_assets USING btree (is_primary);


-- Name: idx_user_assets_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_assets_user_id ON public.user_assets USING btree (user_id);


-- Name: idx_user_dashboard_widgets_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_dashboard_widgets_user ON public.user_dashboard_widgets USING btree (user_id);


-- Name: idx_user_expertise_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_expertise_user ON public.user_expertise_topics USING btree (user_id);


-- Name: idx_user_field_visibility_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_field_visibility_user ON public.user_field_visibility USING btree (user_id);


-- Name: idx_user_fun_facts_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_fun_facts_user ON public.user_fun_facts USING btree (user_id);


-- Name: idx_user_group_memberships_group_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_group_memberships_group_id ON public.user_group_memberships USING btree (group_id);


-- Name: idx_user_group_memberships_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_group_memberships_user_id ON public.user_group_memberships USING btree (user_id);


-- Name: idx_user_groups_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_groups_email ON public.user_groups USING btree (email);


-- Name: idx_user_groups_org_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_groups_org_id ON public.user_groups USING btree (organization_id);


-- Name: idx_user_interests_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_interests_user ON public.user_interests USING btree (user_id);


-- Name: idx_user_media_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_media_user ON public.user_media USING btree (user_id);


-- Name: idx_user_requests_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_org ON public.user_requests USING btree (organization_id);


-- Name: idx_user_requests_requested_by; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_requested_by ON public.user_requests USING btree (requested_by);


-- Name: idx_user_requests_start_date; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_start_date ON public.user_requests USING btree (start_date) WHERE (start_date IS NOT NULL);


-- Name: idx_user_requests_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_status ON public.user_requests USING btree (organization_id, status);


-- Name: idx_user_requests_type; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_type ON public.user_requests USING btree (organization_id, request_type);


-- Name: idx_user_requests_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_requests_user_id ON public.user_requests USING btree (user_id) WHERE (user_id IS NOT NULL);


-- Name: idx_user_secondary_emails_email; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_secondary_emails_email ON public.user_secondary_emails USING btree (email);


-- Name: idx_user_secondary_emails_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_secondary_emails_user_id ON public.user_secondary_emails USING btree (user_id);


-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


-- Name: idx_user_signature_status_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_signature_status_org ON public.user_signature_status USING btree (organization_id);


-- Name: idx_user_signature_status_pending; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_signature_status_pending ON public.user_signature_status USING btree (organization_id, last_sync_attempt_at) WHERE ((sync_status)::text = 'pending'::text);


-- Name: idx_user_signature_status_sync; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_user_signature_status_sync ON public.user_signature_status USING btree (organization_id, sync_status);


-- Name: idx_workflows_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflows_active ON public.workflows USING btree (is_active);


-- Name: idx_workflows_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflows_org ON public.workflows USING btree (organization_id);


-- Name: idx_workspace_members_user; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workspace_members_user ON public.workspace_members USING btree (user_id);


-- Name: idx_workspace_members_workspace; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workspace_members_workspace ON public.workspace_members USING btree (workspace_id);


-- Name: idx_workspaces_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workspaces_active ON public.workspaces USING btree (organization_id, is_active) WHERE (is_active = true);


-- Name: idx_workspaces_org; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workspaces_org ON public.workspaces USING btree (organization_id);


-- Name: idx_workspaces_platform; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workspaces_platform ON public.workspaces USING btree (platform, external_id);


-- Name: campaign_analytics_summary _RETURN; Type: RULE; Schema: public; Owner: -

CREATE OR REPLACE VIEW public.campaign_analytics_summary AS
 SELECT sc.id AS campaign_id,
    sc.organization_id,
    sc.name,
    sc.status,
    sc.start_date,
    sc.end_date,
    sc.tracking_enabled,
    count(DISTINCT stp.user_id) AS enrolled_users,
    count(ste.id) AS total_opens,
    count(ste.id) FILTER (WHERE (ste.is_unique = true)) AS unique_opens,
    count(DISTINCT ste.ip_address_hash) AS unique_recipients,
        CASE
            WHEN (count(DISTINCT stp.user_id) > 0) THEN round(((count(ste.id))::numeric / (count(DISTINCT stp.user_id))::numeric), 2)
            ELSE (0)::numeric
        END AS opens_per_user
   FROM ((public.signature_campaigns sc
     LEFT JOIN public.signature_tracking_pixels stp ON ((stp.campaign_id = sc.id)))
     LEFT JOIN public.signature_tracking_events ste ON ((ste.campaign_id = sc.id)))
  GROUP BY sc.id;


-- Name: departments departments_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: offboarding_templates ensure_single_default_offboarding; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER ensure_single_default_offboarding BEFORE INSERT OR UPDATE ON public.offboarding_templates FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_single_default_offboarding_template();


-- Name: onboarding_templates ensure_single_default_onboarding; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER ensure_single_default_onboarding BEFORE INSERT OR UPDATE ON public.onboarding_templates FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_single_default_onboarding_template();


-- Name: lifecycle_tasks lifecycle_tasks_update_counts; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER lifecycle_tasks_update_counts AFTER INSERT OR DELETE OR UPDATE OF status ON public.lifecycle_tasks FOR EACH ROW EXECUTE FUNCTION public.update_request_task_counts();


-- Name: lifecycle_tasks lifecycle_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER lifecycle_tasks_updated_at BEFORE UPDATE ON public.lifecycle_tasks FOR EACH ROW EXECUTE FUNCTION public.update_lifecycle_tasks_updated_at();


-- Name: offboarding_templates offboarding_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER offboarding_templates_updated_at BEFORE UPDATE ON public.offboarding_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: onboarding_templates onboarding_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER onboarding_templates_updated_at BEFORE UPDATE ON public.onboarding_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: scheduled_user_actions scheduled_user_actions_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER scheduled_user_actions_updated_at BEFORE UPDATE ON public.scheduled_user_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: media_asset_folders tr_media_asset_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER tr_media_asset_folders_updated_at BEFORE UPDATE ON public.media_asset_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: media_asset_settings tr_media_asset_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER tr_media_asset_settings_updated_at BEFORE UPDATE ON public.media_asset_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: media_assets tr_media_assets_set_token; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER tr_media_assets_set_token BEFORE INSERT ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.set_media_asset_access_token();


-- Name: media_assets tr_media_assets_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER tr_media_assets_updated_at BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: signature_templates trg_ensure_single_default_signature; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trg_ensure_single_default_signature BEFORE INSERT OR UPDATE OF is_default ON public.signature_templates FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_single_default_signature_template();


-- Name: signature_assignments trg_signature_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trg_signature_assignments_updated_at BEFORE UPDATE ON public.signature_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: signature_campaigns trg_signature_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trg_signature_campaigns_updated_at BEFORE UPDATE ON public.signature_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: signature_templates trg_signature_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trg_signature_templates_updated_at BEFORE UPDATE ON public.signature_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: user_signature_status trg_user_signature_status_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trg_user_signature_status_updated_at BEFORE UPDATE ON public.user_signature_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: ai_config trigger_ai_config_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_ai_config_updated_at BEFORE UPDATE ON public.ai_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: automation_rules trigger_automation_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_automation_rules_updated_at BEFORE UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_rules_updated_at();


-- Name: cost_centers trigger_cost_centers_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: locations trigger_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: master_data_settings trigger_master_data_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_master_data_settings_updated_at BEFORE UPDATE ON public.master_data_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: named_conditions trigger_named_conditions_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_named_conditions_updated_at BEFORE UPDATE ON public.named_conditions FOR EACH ROW EXECUTE FUNCTION public.update_rules_updated_at();


-- Name: organizations trigger_seed_labels_on_org_creation; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_seed_labels_on_org_creation AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.initialize_organization_labels();


-- Name: automation_rules trigger_update_condition_usage; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_update_condition_usage AFTER INSERT OR DELETE OR UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_named_condition_usage();


-- Name: feature_flags trigger_update_feature_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER trigger_update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: gw_credentials update_gw_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_gw_credentials_updated_at BEFORE UPDATE ON public.gw_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: gw_groups update_gw_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_gw_groups_updated_at BEFORE UPDATE ON public.gw_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: gw_org_units update_gw_org_units_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_gw_org_units_updated_at BEFORE UPDATE ON public.gw_org_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: gw_synced_users update_gw_synced_users_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_gw_synced_users_updated_at BEFORE UPDATE ON public.gw_synced_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: modules update_modules_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: ms_credentials update_ms_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_ms_credentials_updated_at BEFORE UPDATE ON public.ms_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: ms_licenses update_ms_licenses_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_ms_licenses_updated_at BEFORE UPDATE ON public.ms_licenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: ms_synced_groups update_ms_synced_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_ms_synced_groups_updated_at BEFORE UPDATE ON public.ms_synced_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: ms_synced_users update_ms_synced_users_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_ms_synced_users_updated_at BEFORE UPDATE ON public.ms_synced_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Name: organization_modules update_organization_modules_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_organization_modules_updated_at BEFORE UPDATE ON public.organization_modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: organization_settings update_organization_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_organization_settings_updated_at BEFORE UPDATE ON public.organization_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: organization_users update_organization_users_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_organization_users_updated_at BEFORE UPDATE ON public.organization_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Name: user_requests user_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER user_requests_updated_at BEFORE UPDATE ON public.user_requests FOR EACH ROW EXECUTE FUNCTION public.update_user_requests_updated_at();


-- Name: access_group_members access_group_members_access_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_access_group_id_fkey FOREIGN KEY (access_group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


-- Name: access_group_members access_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: access_groups access_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: activity_logs activity_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: ai_chat_history ai_chat_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ai_chat_history ai_chat_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: ai_config ai_config_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ai_usage_log ai_usage_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ai_usage_log ai_usage_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: api_key_usage_logs api_key_usage_logs_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;


-- Name: api_keys api_keys_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: assets assets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id);


-- Name: auth_accounts auth_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: automation_rules automation_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: automation_rules automation_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: automation_rules automation_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: bulk_operations bulk_operations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: campaign_assignments campaign_assignments_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_assignments
    ADD CONSTRAINT campaign_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE CASCADE;


-- Name: cost_centers cost_centers_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: cost_centers cost_centers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: custom_field_definitions custom_field_definitions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: custom_field_values custom_field_values_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE;


-- Name: custom_labels custom_labels_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: departments departments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: departments departments_parent_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: dynamic_group_rules dynamic_group_rules_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.dynamic_group_rules
    ADD CONSTRAINT dynamic_group_rules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


-- Name: email_templates email_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: organization_users fk_org_users_cost_center; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT fk_org_users_cost_center FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL;


-- Name: organization_users fk_org_users_department; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT fk_org_users_department FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: organization_users fk_org_users_location; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT fk_org_users_location FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


-- Name: user_signature_status fk_user_signature_status_campaign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT fk_user_signature_status_campaign FOREIGN KEY (active_campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE SET NULL;


-- Name: gw_credentials gw_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: gw_groups gw_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: gw_org_units gw_org_units_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: gw_synced_users gw_synced_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: helpdesk_tickets helpdesk_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: helpdesk_tickets helpdesk_tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: helpdesk_tickets helpdesk_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: job_titles job_titles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: job_titles job_titles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: lifecycle_tasks lifecycle_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: lifecycle_tasks lifecycle_tasks_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: lifecycle_tasks lifecycle_tasks_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.lifecycle_tasks(id) ON DELETE SET NULL;


-- Name: lifecycle_tasks lifecycle_tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: lifecycle_tasks lifecycle_tasks_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.user_requests(id) ON DELETE CASCADE;


-- Name: lifecycle_tasks lifecycle_tasks_scheduled_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_scheduled_action_id_fkey FOREIGN KEY (scheduled_action_id) REFERENCES public.scheduled_user_actions(id) ON DELETE SET NULL;


-- Name: lifecycle_tasks lifecycle_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lifecycle_tasks
    ADD CONSTRAINT lifecycle_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: locations locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE SET NULL;


-- Name: master_data_settings master_data_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.master_data_settings
    ADD CONSTRAINT master_data_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: media_asset_folders media_asset_folders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_folders
    ADD CONSTRAINT media_asset_folders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: media_asset_folders media_asset_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_folders
    ADD CONSTRAINT media_asset_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.media_asset_folders(id) ON DELETE CASCADE;


-- Name: media_asset_settings media_asset_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_asset_settings
    ADD CONSTRAINT media_asset_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: media_assets media_assets_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.media_asset_folders(id) ON DELETE SET NULL;


-- Name: media_assets media_assets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ms_credentials ms_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_credentials
    ADD CONSTRAINT ms_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ms_group_memberships ms_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_group_memberships
    ADD CONSTRAINT ms_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.ms_synced_groups(id) ON DELETE CASCADE;


-- Name: ms_group_memberships ms_group_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_group_memberships
    ADD CONSTRAINT ms_group_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ms_group_memberships ms_group_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_group_memberships
    ADD CONSTRAINT ms_group_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ms_synced_users(id) ON DELETE CASCADE;


-- Name: ms_licenses ms_licenses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_licenses
    ADD CONSTRAINT ms_licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ms_synced_groups ms_synced_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_groups
    ADD CONSTRAINT ms_synced_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: ms_synced_users ms_synced_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ms_synced_users
    ADD CONSTRAINT ms_synced_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: named_conditions named_conditions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.named_conditions
    ADD CONSTRAINT named_conditions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: named_conditions named_conditions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.named_conditions
    ADD CONSTRAINT named_conditions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: named_conditions named_conditions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.named_conditions
    ADD CONSTRAINT named_conditions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: offboarding_templates offboarding_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.offboarding_templates
    ADD CONSTRAINT offboarding_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: onboarding_templates onboarding_templates_default_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_default_manager_id_fkey FOREIGN KEY (default_manager_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: onboarding_templates onboarding_templates_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: onboarding_templates onboarding_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: organization_modules organization_modules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: organization_settings organization_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: organization_users organization_users_guest_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_guest_invited_by_fkey FOREIGN KEY (guest_invited_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: organization_users organization_users_reporting_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_reporting_manager_id_fkey FOREIGN KEY (reporting_manager_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: password_setup_tokens password_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: rule_evaluation_log rule_evaluation_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rule_evaluation_log
    ADD CONSTRAINT rule_evaluation_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: rule_evaluation_log rule_evaluation_log_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rule_evaluation_log
    ADD CONSTRAINT rule_evaluation_log_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id) ON DELETE SET NULL;


-- Name: rule_evaluation_log rule_evaluation_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rule_evaluation_log
    ADD CONSTRAINT rule_evaluation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: scheduled_user_actions scheduled_user_actions_depends_on_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_depends_on_action_id_fkey FOREIGN KEY (depends_on_action_id) REFERENCES public.scheduled_user_actions(id) ON DELETE SET NULL;


-- Name: scheduled_user_actions scheduled_user_actions_offboarding_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_offboarding_template_id_fkey FOREIGN KEY (offboarding_template_id) REFERENCES public.offboarding_templates(id) ON DELETE SET NULL;


-- Name: scheduled_user_actions scheduled_user_actions_onboarding_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_onboarding_template_id_fkey FOREIGN KEY (onboarding_template_id) REFERENCES public.onboarding_templates(id) ON DELETE SET NULL;


-- Name: scheduled_user_actions scheduled_user_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: scheduled_user_actions scheduled_user_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.scheduled_user_actions
    ADD CONSTRAINT scheduled_user_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: security_events security_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: security_events security_events_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: signature_assignments signature_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: signature_assignments signature_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE CASCADE;


-- Name: signature_campaigns signature_campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: signature_campaigns signature_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE RESTRICT;


-- Name: signature_permissions signature_permissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_permissions
    ADD CONSTRAINT signature_permissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: signature_permissions signature_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_permissions
    ADD CONSTRAINT signature_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: signature_templates signature_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: signature_tracking_events signature_tracking_events_pixel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_events
    ADD CONSTRAINT signature_tracking_events_pixel_id_fkey FOREIGN KEY (pixel_id) REFERENCES public.signature_tracking_pixels(id) ON DELETE CASCADE;


-- Name: signature_tracking_pixels signature_tracking_pixels_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_pixels
    ADD CONSTRAINT signature_tracking_pixels_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE CASCADE;


-- Name: signature_tracking_pixels signature_tracking_pixels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_tracking_pixels
    ADD CONSTRAINT signature_tracking_pixels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: signature_user_tracking signature_user_tracking_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE SET NULL;


-- Name: signature_user_tracking signature_user_tracking_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: signature_user_tracking signature_user_tracking_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE SET NULL;


-- Name: signature_user_tracking signature_user_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signature_user_tracking
    ADD CONSTRAINT signature_user_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: smtp_settings smtp_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: sso_providers sso_providers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sso_providers
    ADD CONSTRAINT sso_providers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: training_content training_content_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.training_content
    ADD CONSTRAINT training_content_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id);


-- Name: training_content training_content_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.training_content
    ADD CONSTRAINT training_content_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: training_quiz_questions training_quiz_questions_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.training_quiz_questions
    ADD CONSTRAINT training_quiz_questions_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.training_content(id) ON DELETE CASCADE;


-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_assets user_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


-- Name: user_assets user_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_dashboard_widgets user_dashboard_widgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_dashboard_widgets
    ADD CONSTRAINT user_dashboard_widgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_expertise_topics user_expertise_topics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_expertise_topics
    ADD CONSTRAINT user_expertise_topics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_field_visibility user_field_visibility_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_field_visibility
    ADD CONSTRAINT user_field_visibility_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_fun_facts user_fun_facts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_fun_facts
    ADD CONSTRAINT user_fun_facts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_group_memberships user_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


-- Name: user_group_memberships user_group_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_groups user_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_initial_passwords user_initial_passwords_cleared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT user_initial_passwords_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_initial_passwords user_initial_passwords_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT user_initial_passwords_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_initial_passwords user_initial_passwords_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT user_initial_passwords_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_initial_passwords user_initial_passwords_revealed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_initial_passwords
    ADD CONSTRAINT user_initial_passwords_revealed_by_fkey FOREIGN KEY (revealed_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_interests user_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_lifecycle_logs user_lifecycle_logs_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_lifecycle_logs
    ADD CONSTRAINT user_lifecycle_logs_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.scheduled_user_actions(id) ON DELETE SET NULL;


-- Name: user_lifecycle_logs user_lifecycle_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_lifecycle_logs
    ADD CONSTRAINT user_lifecycle_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_lifecycle_logs user_lifecycle_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_lifecycle_logs
    ADD CONSTRAINT user_lifecycle_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_media user_media_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_media
    ADD CONSTRAINT user_media_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_requests user_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_requests user_requests_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


-- Name: user_requests user_requests_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_requests user_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_requests user_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_requests user_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


-- Name: user_secondary_emails user_secondary_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_signature_status user_signature_status_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.signature_assignments(id) ON DELETE SET NULL;


-- Name: user_signature_status user_signature_status_current_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_current_template_id_fkey FOREIGN KEY (current_template_id) REFERENCES public.signature_templates(id) ON DELETE SET NULL;


-- Name: user_signature_status user_signature_status_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_signature_status user_signature_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_signature_status
    ADD CONSTRAINT user_signature_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: user_training_progress user_training_progress_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.organization_users(id);


-- Name: user_training_progress user_training_progress_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.training_content(id) ON DELETE CASCADE;


-- Name: user_training_progress user_training_progress_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: user_training_progress user_training_progress_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.user_requests(id);


-- Name: user_training_progress user_training_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_training_progress
    ADD CONSTRAINT user_training_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: workflows workflows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


-- Name: workspaces workspaces_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;






--
-- Typed-key constraints + indexes, and the security audit log.
--
-- These live at the end of the file because the seed is a pg_dump-shaped
-- document: every table exists by this point, so constraints and FKs resolve.
--
-- WHY THIS IS HERE AND NOT IN A MIGRATION: pre-release, with no users and no
-- deployed installs, a fresh database must come up COMPLETE from this file
-- alone. Helios also never applied backend/database/migrations/ at boot (the
-- runner pointed at a different directory and there was no tracking table), so
-- "put it in a migration" is how the api_keys drift went unnoticed until MTP
-- pairing failed and the running container had to be patched by hand.
--

ALTER TABLE ONLY public.api_keys
    DROP CONSTRAINT IF EXISTS api_keys_type_check;
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_type_check
    CHECK (type IN ('service', 'vendor', 'helios-mtp-pairing'));

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;

-- Fast lookup of an org's pairing keys (pairings list / revocation UI).
CREATE INDEX IF NOT EXISTS idx_api_keys_mtp_pairing
    ON public.api_keys (organization_id, created_at DESC)
    WHERE type = 'helios-mtp-pairing';

COMMENT ON COLUMN public.api_keys.pairing_window_expires_at IS 'helios-mtp-pairing only: handshake must complete before this instant (15-minute window from issuance)';
COMMENT ON COLUMN public.api_keys.paired_at IS 'helios-mtp-pairing only: set exactly once by the first successful handshake (atomic single-use bind)';
COMMENT ON COLUMN public.api_keys.paired_from_ip IS 'helios-mtp-pairing only: IP that completed the handshake (customer-visible for leak detection)';
COMMENT ON COLUMN public.api_keys.revoked_at IS 'Authoritative revocation timestamp; /api/v1/mtp/* on a revoked pairing returns an explicit revoked signal';

--
-- security_audit_logs: append-only, hash-chained security audit trail.
-- Absent from the seed entirely, so a fresh install had no audit table at all.
--
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_type character varying(20) NOT NULL,
    actor_email character varying(255),
    actor_ip inet,
    actor_user_agent text,
    action character varying(100) NOT NULL,
    action_category character varying(50) NOT NULL,
    target_type character varying(50),
    target_id uuid,
    target_identifier character varying(255),
    session_id uuid,
    organization_id uuid NOT NULL,
    request_id character varying(64),
    ticket_reference character varying(100),
    outcome character varying(20) NOT NULL,
    error_code character varying(50),
    error_message text,
    changes_before jsonb,
    changes_after jsonb,
    risk_score smallint,
    flagged boolean DEFAULT false,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    -- Tamper detection: each row chains to the previous row's hash.
    previous_hash character varying(64),
    record_hash character varying(64) NOT NULL,
    CONSTRAINT security_audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT valid_outcome CHECK (outcome IN ('success', 'failure', 'partial', 'blocked')),
    CONSTRAINT valid_actor_type CHECK (actor_type IN ('user', 'service', 'mtp', 'system', 'anonymous')),
    CONSTRAINT valid_action_category CHECK (action_category IN ('auth', 'admin', 'data', 'security', 'api', 'sync'))
);

CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp ON public.security_audit_logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_actor     ON public.security_audit_logs (actor_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_action    ON public.security_audit_logs (action, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_category  ON public.security_audit_logs (action_category, "timestamp" DESC);
