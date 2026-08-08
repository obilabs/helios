--
-- PostgreSQL database dump
--

\restrict TJ1Japex3FukpdfnYg2WLMvA3kLqSnLusVHhPHD1WmuIj4tbYe9AbcEAl0jhAaR

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.audit_action AS ENUM (
    'create',
    'update',
    'delete',
    'login',
    'logout',
    'password_change',
    'settings_change'
);


ALTER TYPE public.audit_action OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'manager',
    'user'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: user_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_type_enum AS ENUM (
    'staff',
    'guest',
    'contact'
);


ALTER TYPE public.user_type_enum OWNER TO postgres;

--
-- Name: check_module_dependencies(uuid, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_module_dependencies(p_organization_id uuid, p_module_key character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_required_modules JSONB;
  v_required_module TEXT;
  v_is_enabled BOOLEAN;
BEGIN
  -- Get required modules for this module
  SELECT requires_modules INTO v_required_modules
  FROM available_modules
  WHERE module_key = p_module_key;

  -- If no dependencies, return true
  IF v_required_modules IS NULL OR jsonb_array_length(v_required_modules) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Check each required module
  FOR v_required_module IN SELECT jsonb_array_elements_text(v_required_modules)
  LOOP
    -- Check if required module is enabled
    SELECT om.is_enabled INTO v_is_enabled
    FROM organization_modules om
    JOIN available_modules am ON am.id = om.module_id
    WHERE om.organization_id = p_organization_id
      AND am.module_key = v_required_module;

    -- If required module not enabled, return false
    IF v_is_enabled IS NULL OR v_is_enabled = FALSE THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  -- All dependencies met
  RETURN TRUE;
END;
$$;


ALTER FUNCTION public.check_module_dependencies(p_organization_id uuid, p_module_key character varying) OWNER TO postgres;

--
-- Name: cleanup_stale_presence(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_stale_presence() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM helpdesk_presence
  WHERE last_ping < NOW() - INTERVAL '1 minute';
END;
$$;


ALTER FUNCTION public.cleanup_stale_presence() OWNER TO postgres;

--
-- Name: get_available_entities(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_available_entities(org_id uuid) RETURNS TABLE(canonical_name character varying, provided_by character varying[])
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH enabled_modules AS (
    SELECT am.module_key
    FROM organization_modules om
    JOIN available_modules am ON am.id = om.module_id
    WHERE om.organization_id = org_id AND om.is_enabled = true
  ),
  core_entities AS (
    -- Core entities always available
    SELECT DISTINCT
      mep.entity_canonical_name,
      ARRAY['core']::VARCHAR[] as providers
    FROM module_entity_providers mep
    WHERE mep.module_key = 'core'
  ),
  module_entities AS (
    -- Entities from enabled modules
    SELECT
      mep.entity_canonical_name,
      array_agg(mep.module_key) as providers
    FROM module_entity_providers mep
    WHERE mep.module_key IN (SELECT module_key FROM enabled_modules)
    GROUP BY mep.entity_canonical_name
  )
  SELECT
    COALESCE(c.entity_canonical_name, m.entity_canonical_name) as canonical_name,
    COALESCE(c.providers, ARRAY[]::VARCHAR[]) || COALESCE(m.providers, ARRAY[]::VARCHAR[]) as provided_by
  FROM core_entities c
  FULL OUTER JOIN module_entities m ON c.entity_canonical_name = m.entity_canonical_name;
END;
$$;


ALTER FUNCTION public.get_available_entities(org_id uuid) OWNER TO postgres;

--
-- Name: get_organization_setting(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

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


ALTER FUNCTION public.get_organization_setting(org_id uuid, setting_key text, default_value text) OWNER TO postgres;

--
-- Name: increment_asset_usage_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_asset_usage_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public_assets
  SET usage_count = usage_count + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.increment_asset_usage_count() OWNER TO postgres;

--
-- Name: initialize_organization_labels(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.initialize_organization_labels() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Seed default labels for the new organization
  PERFORM seed_default_labels(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.initialize_organization_labels() OWNER TO postgres;

--
-- Name: is_organization_setup_complete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_organization_setup_complete() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM organizations WHERE is_setup_complete = true LIMIT 1
    );
END;
$$;


ALTER FUNCTION public.is_organization_setup_complete() OWNER TO postgres;

--
-- Name: log_activity(uuid, character varying, uuid, uuid, character varying, character varying, text, jsonb, inet, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_activity(p_organization_id uuid, p_action character varying, p_user_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO activity_logs (
        organization_id,
        user_id,
        actor_id,
        action,
        resource_type,
        resource_id,
        description,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        p_organization_id,
        p_user_id,
        p_actor_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_description,
        p_metadata,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;


ALTER FUNCTION public.log_activity(p_organization_id uuid, p_action character varying, p_user_id uuid, p_actor_id uuid, p_resource_type character varying, p_resource_id character varying, p_description text, p_metadata jsonb, p_ip_address inet, p_user_agent text) OWNER TO postgres;

--
-- Name: FUNCTION log_activity(p_organization_id uuid, p_action character varying, p_user_id uuid, p_actor_id uuid, p_resource_type character varying, p_resource_id character varying, p_description text, p_metadata jsonb, p_ip_address inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.log_activity(p_organization_id uuid, p_action character varying, p_user_id uuid, p_actor_id uuid, p_resource_type character varying, p_resource_id character varying, p_description text, p_metadata jsonb, p_ip_address inet, p_user_agent text) IS 'Helper function to insert activity logs with consistent structure';


--
-- Name: seed_default_labels(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.seed_default_labels(org_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Insert default labels for all canonical entities
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


ALTER FUNCTION public.seed_default_labels(org_id uuid) OWNER TO postgres;

--
-- Name: sync_is_guest(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_is_guest() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.is_guest := (NEW.user_type = 'guest');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_is_guest() OWNER TO postgres;

--
-- Name: update_departments_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_departments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_departments_updated_at() OWNER TO postgres;

--
-- Name: update_platform_integrations_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_platform_integrations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_platform_integrations_updated_at() OWNER TO postgres;

--
-- Name: update_template_assignments_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_template_assignments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_template_assignments_updated_at() OWNER TO postgres;

--
-- Name: update_template_campaigns_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_template_campaigns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_template_campaigns_updated_at() OWNER TO postgres;

--
-- Name: update_template_types_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_template_types_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_template_types_updated_at() OWNER TO postgres;

--
-- Name: update_ticket_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ticket_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ticket_timestamp() OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_group_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.access_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    access_group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    member_type character varying(50) DEFAULT 'member'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    joined_at timestamp without time zone DEFAULT now(),
    removed_at timestamp without time zone,
    synced_from_platform boolean DEFAULT true
);


ALTER TABLE public.access_group_members OWNER TO postgres;

--
-- Name: TABLE access_group_members; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.access_group_members IS 'Members of access groups for permission management and distribution lists';


--
-- Name: access_groups; Type: TABLE; Schema: public; Owner: postgres
--

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
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp without time zone DEFAULT now(),
    synced_at timestamp without time zone,
    is_system boolean DEFAULT false
);


ALTER TABLE public.access_groups OWNER TO postgres;

--
-- Name: TABLE access_groups; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.access_groups IS 'Permission and mailing lists (Google Groups, M365 Security/Distribution Groups). Used for access control and communications.';


--
-- Name: COLUMN access_groups.group_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.access_groups.group_type IS 'Type of group: standard, system_email_forward, system_automation';


--
-- Name: COLUMN access_groups.is_system; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.access_groups.is_system IS 'True if group is system-managed (hidden from normal UI)';


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    department character varying(255),
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    last_login timestamp with time zone,
    password_reset_token character varying(255),
    password_reset_expires timestamp with time zone,
    email_verification_token character varying(255),
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    alternate_email character varying(255),
    password_setup_method character varying(20) DEFAULT 'admin_set'::character varying,
    scheduled_creation_date timestamp without time zone,
    sync_to_google boolean DEFAULT false,
    sync_to_microsoft365 boolean DEFAULT false,
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
    microsoft_365_id character varying(255),
    github_username character varying(255),
    slack_user_id character varying(255),
    jumpcloud_user_id character varying(255),
    associate_id character varying(100),
    google_workspace_sync_status character varying(50) DEFAULT 'not_synced'::character varying,
    google_workspace_last_sync timestamp with time zone,
    microsoft_365_sync_status character varying(50) DEFAULT 'not_synced'::character varying,
    microsoft_365_last_sync timestamp with time zone,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    avatar_url character varying(500),
    photo_data text,
    department_id uuid,
    professional_designations text,
    pronouns character varying(50),
    user_linkedin_url character varying(500),
    user_twitter_url character varying(500),
    user_github_url character varying(500),
    user_portfolio_url character varying(500),
    user_instagram_url character varying(500),
    user_facebook_url character varying(500),
    avatar_asset_id uuid,
    avatar_url_50 character varying(500),
    avatar_url_100 character varying(500),
    avatar_url_200 character varying(500),
    avatar_url_400 character varying(500),
    deleted_at timestamp with time zone,
    user_status character varying(20) DEFAULT 'active'::character varying,
    is_guest boolean DEFAULT false,
    guest_expires_at timestamp without time zone,
    guest_invited_by uuid,
    guest_invited_at timestamp without time zone,
    user_type public.user_type_enum DEFAULT 'staff'::public.user_type_enum,
    company character varying(255),
    contact_tags text[],
    added_by uuid,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    blocked_at timestamp without time zone,
    blocked_by uuid,
    blocked_reason text,
    CONSTRAINT check_contact_no_password CHECK ((((user_type = 'contact'::public.user_type_enum) AND (password_hash IS NULL) AND (is_active = false)) OR (user_type <> 'contact'::public.user_type_enum))),
    CONSTRAINT check_staff_no_guest_fields CHECK ((((user_type = 'staff'::public.user_type_enum) AND (guest_expires_at IS NULL) AND (guest_invited_by IS NULL)) OR (user_type <> 'staff'::public.user_type_enum))),
    CONSTRAINT chk_employee_type CHECK (((employee_type)::text = ANY ((ARRAY['Full Time'::character varying, 'Part Time'::character varying, 'Contractor'::character varying, 'Intern'::character varying, 'Temporary'::character varying, 'Consultant'::character varying])::text[]))),
    CONSTRAINT chk_google_workspace_sync_status CHECK (((google_workspace_sync_status)::text = ANY ((ARRAY['not_synced'::character varying, 'pending'::character varying, 'synced'::character varying, 'failed'::character varying, 'error'::character varying])::text[]))),
    CONSTRAINT chk_microsoft_365_sync_status CHECK (((microsoft_365_sync_status)::text = ANY ((ARRAY['not_synced'::character varying, 'pending'::character varying, 'synced'::character varying, 'failed'::character varying, 'error'::character varying])::text[])))
);


ALTER TABLE public.organization_users OWNER TO postgres;

--
-- Name: TABLE organization_users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.organization_users IS 'Organization users table. Status field cleaned up in migration 023 - now uses user_status exclusively.';


--
-- Name: COLUMN organization_users.alternate_email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.alternate_email IS 'Alternate email for password setup and recovery';


--
-- Name: COLUMN organization_users.password_setup_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.password_setup_method IS 'How password was set: admin_set or email_link';


--
-- Name: COLUMN organization_users.organizational_unit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.organizational_unit IS 'Hierarchical OU path, e.g., /Engineering/Software Development';


--
-- Name: COLUMN organization_users.employee_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.employee_type IS 'Employment type: Full Time, Part Time, Contractor, Intern, Temporary';


--
-- Name: COLUMN organization_users.google_workspace_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.google_workspace_id IS 'Google Workspace user ID for platform sync';


--
-- Name: COLUMN organization_users.microsoft_365_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.microsoft_365_id IS 'Microsoft 365 user ID for platform sync';


--
-- Name: COLUMN organization_users.google_workspace_sync_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.google_workspace_sync_status IS 'Sync status: not_synced, pending, synced, failed';


--
-- Name: COLUMN organization_users.custom_fields; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.custom_fields IS 'JSONB field for flexible custom attributes';


--
-- Name: COLUMN organization_users.professional_designations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.professional_designations IS 'Professional designations/certifications (comma or space separated)';


--
-- Name: COLUMN organization_users.pronouns; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.pronouns IS 'User preferred pronouns';


--
-- Name: COLUMN organization_users.user_linkedin_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.user_linkedin_url IS 'User personal LinkedIn profile URL';


--
-- Name: COLUMN organization_users.user_twitter_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.user_twitter_url IS 'User personal Twitter/X profile URL';


--
-- Name: COLUMN organization_users.user_github_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.user_github_url IS 'User personal GitHub profile URL';


--
-- Name: COLUMN organization_users.avatar_asset_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.avatar_asset_id IS 'Reference to user photo in public_assets';


--
-- Name: COLUMN organization_users.avatar_url_50; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.avatar_url_50 IS '50x50 avatar for lists and small UI elements';


--
-- Name: COLUMN organization_users.avatar_url_100; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.avatar_url_100 IS '100x100 avatar for cards and medium elements';


--
-- Name: COLUMN organization_users.avatar_url_200; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.avatar_url_200 IS '200x200 avatar for signatures and profiles';


--
-- Name: COLUMN organization_users.avatar_url_400; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.avatar_url_400 IS '400x400 avatar for large profile displays';


--
-- Name: COLUMN organization_users.deleted_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.deleted_at IS 'Timestamp when user was soft deleted. NULL = not deleted';


--
-- Name: COLUMN organization_users.user_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.user_status IS 'User status: active (can login), staged (awaiting activation), suspended (temporarily disabled), deleted (soft deleted), blocked (security)';


--
-- Name: COLUMN organization_users.is_guest; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.is_guest IS 'Whether this is a guest user (external collaborator with limited access)';


--
-- Name: COLUMN organization_users.guest_expires_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.guest_expires_at IS 'When guest access expires (null = no expiration)';


--
-- Name: COLUMN organization_users.guest_invited_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.guest_invited_by IS 'User who invited this guest';


--
-- Name: COLUMN organization_users.guest_invited_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.guest_invited_at IS 'When the guest was invited';


--
-- Name: COLUMN organization_users.user_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.user_type IS 'User classification: staff (employees), guest (external with access), contact (external without access)';


--
-- Name: COLUMN organization_users.company; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.company IS 'Company name (primarily for contacts and guests)';


--
-- Name: COLUMN organization_users.contact_tags; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.contact_tags IS 'Tags for categorizing contacts: vendor, partner, customer, etc.';


--
-- Name: COLUMN organization_users.added_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.added_by IS 'User who added this contact (for contacts and guests)';


--
-- Name: COLUMN organization_users.added_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.added_at IS 'When this user/contact was added to the system';


--
-- Name: COLUMN organization_users.blocked_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.blocked_at IS 'Timestamp when user account was blocked (security lockout)';


--
-- Name: COLUMN organization_users.blocked_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.blocked_by IS 'User ID of admin who blocked this account';


--
-- Name: COLUMN organization_users.blocked_reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organization_users.blocked_reason IS 'Reason for blocking account (security incident, termination, etc.)';


--
-- Name: active_guests; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.active_guests AS
 SELECT id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    department,
    is_active,
    email_verified,
    last_login,
    password_reset_token,
    password_reset_expires,
    email_verification_token,
    two_factor_enabled,
    two_factor_secret,
    created_at,
    updated_at,
    alternate_email,
    password_setup_method,
    scheduled_creation_date,
    sync_to_google,
    sync_to_microsoft365,
    job_title,
    organizational_unit,
    location,
    reporting_manager_id,
    employee_id,
    employee_type,
    cost_center,
    start_date,
    end_date,
    bio,
    mobile_phone,
    work_phone,
    work_phone_extension,
    timezone,
    preferred_language,
    google_workspace_id,
    microsoft_365_id,
    github_username,
    slack_user_id,
    jumpcloud_user_id,
    associate_id,
    google_workspace_sync_status,
    google_workspace_last_sync,
    microsoft_365_sync_status,
    microsoft_365_last_sync,
    custom_fields,
    avatar_url,
    photo_data,
    department_id,
    professional_designations,
    pronouns,
    user_linkedin_url,
    user_twitter_url,
    user_github_url,
    user_portfolio_url,
    user_instagram_url,
    user_facebook_url,
    avatar_asset_id,
    avatar_url_50,
    avatar_url_100,
    avatar_url_200,
    avatar_url_400,
    deleted_at,
    user_status,
    is_guest,
    guest_expires_at,
    guest_invited_by,
    guest_invited_at,
    user_type,
    company,
    contact_tags,
    added_by,
    added_at,
    blocked_at,
    blocked_by,
    blocked_reason
   FROM public.organization_users
  WHERE ((user_type = 'guest'::public.user_type_enum) AND ((deleted_at IS NULL) OR (deleted_at > CURRENT_TIMESTAMP)) AND ((user_status)::text = ANY ((ARRAY['active'::character varying, 'staged'::character varying])::text[])));


ALTER VIEW public.active_guests OWNER TO postgres;

--
-- Name: active_staff; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.active_staff AS
 SELECT id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    department,
    is_active,
    email_verified,
    last_login,
    password_reset_token,
    password_reset_expires,
    email_verification_token,
    two_factor_enabled,
    two_factor_secret,
    created_at,
    updated_at,
    alternate_email,
    password_setup_method,
    scheduled_creation_date,
    sync_to_google,
    sync_to_microsoft365,
    job_title,
    organizational_unit,
    location,
    reporting_manager_id,
    employee_id,
    employee_type,
    cost_center,
    start_date,
    end_date,
    bio,
    mobile_phone,
    work_phone,
    work_phone_extension,
    timezone,
    preferred_language,
    google_workspace_id,
    microsoft_365_id,
    github_username,
    slack_user_id,
    jumpcloud_user_id,
    associate_id,
    google_workspace_sync_status,
    google_workspace_last_sync,
    microsoft_365_sync_status,
    microsoft_365_last_sync,
    custom_fields,
    avatar_url,
    photo_data,
    department_id,
    professional_designations,
    pronouns,
    user_linkedin_url,
    user_twitter_url,
    user_github_url,
    user_portfolio_url,
    user_instagram_url,
    user_facebook_url,
    avatar_asset_id,
    avatar_url_50,
    avatar_url_100,
    avatar_url_200,
    avatar_url_400,
    deleted_at,
    user_status,
    is_guest,
    guest_expires_at,
    guest_invited_by,
    guest_invited_at,
    user_type,
    company,
    contact_tags,
    added_by,
    added_at,
    blocked_at,
    blocked_by,
    blocked_reason
   FROM public.organization_users
  WHERE ((user_type = 'staff'::public.user_type_enum) AND ((deleted_at IS NULL) OR (deleted_at > CURRENT_TIMESTAMP)) AND ((user_status)::text = ANY ((ARRAY['active'::character varying, 'staged'::character varying])::text[])));


ALTER VIEW public.active_staff OWNER TO postgres;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

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
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: TABLE activity_logs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.activity_logs IS 'Audit trail of all user and system actions';


--
-- Name: COLUMN activity_logs.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.user_id IS 'User being acted upon (null for system actions)';


--
-- Name: COLUMN activity_logs.actor_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.actor_id IS 'User performing the action (null for automated actions)';


--
-- Name: COLUMN activity_logs.action; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.action IS 'Action type: login, logout, user_created, user_updated, status_changed, etc.';


--
-- Name: COLUMN activity_logs.resource_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.resource_type IS 'Type of resource: user, group, organization, setting, etc.';


--
-- Name: COLUMN activity_logs.resource_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.resource_id IS 'ID of the resource being acted upon';


--
-- Name: COLUMN activity_logs.metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_logs.metadata IS 'Additional context: old values, new values, error messages, etc.';


--
-- Name: api_key_usage_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_key_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    action character varying(100) NOT NULL,
    resource_type character varying(50) NOT NULL,
    resource_id character varying(255),
    result character varying(20) NOT NULL,
    actor_type character varying(20),
    actor_name character varying(255),
    actor_email character varying(255),
    actor_id character varying(255),
    client_reference character varying(255),
    ip_address inet NOT NULL,
    user_agent text,
    request_duration integer,
    http_method character varying(10),
    http_path text,
    http_status integer,
    error_message text,
    error_code character varying(50),
    metadata jsonb,
    CONSTRAINT api_key_usage_logs_result_check CHECK (((result)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying, 'error'::character varying])::text[])))
);


ALTER TABLE public.api_key_usage_logs OWNER TO postgres;

--
-- Name: TABLE api_key_usage_logs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.api_key_usage_logs IS 'Audit log of all API calls made with API keys. Tracks actor attribution for vendor keys.';


--
-- Name: COLUMN api_key_usage_logs.actor_email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_key_usage_logs.actor_email IS 'Email of human operator (required for vendor keys)';


--
-- Name: COLUMN api_key_usage_logs.client_reference; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_key_usage_logs.client_reference IS 'Ticket number or reference from vendor system';


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(20) NOT NULL,
    key_hash character varying(255) NOT NULL,
    key_prefix character varying(30) NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    last_used_at timestamp without time zone,
    service_config jsonb,
    vendor_config jsonb,
    ip_whitelist jsonb,
    rate_limit_config jsonb,
    CONSTRAINT api_keys_type_check CHECK (((type)::text = ANY ((ARRAY['service'::character varying, 'vendor'::character varying])::text[])))
);


ALTER TABLE public.api_keys OWNER TO postgres;

--
-- Name: TABLE api_keys; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.api_keys IS 'API keys for programmatic access. Supports Service (automation) and Vendor (human operators) types.';


--
-- Name: COLUMN api_keys.type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_keys.type IS 'Service (automation, no actor) or Vendor (human operators, requires actor headers)';


--
-- Name: COLUMN api_keys.key_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash of the API key. Plaintext key is never stored.';


--
-- Name: COLUMN api_keys.key_prefix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_keys.key_prefix IS 'First ~20 characters of key for display in UI (e.g., helios_prod_a9k3...)';


--
-- Name: COLUMN api_keys.permissions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_keys.permissions IS 'Array of permission scopes (e.g., ["read:users", "write:groups"])';


--
-- Name: COLUMN api_keys.vendor_config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.api_keys.vendor_config IS 'Vendor-specific config including actor requirements and allowed actors list';


--
-- Name: asset_access_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asset_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    access_type character varying(50) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    referrer text,
    tracking_result_id uuid,
    accessed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_access_logs OWNER TO postgres;

--
-- Name: asset_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asset_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id uuid NOT NULL,
    usage_context jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_usage OWNER TO postgres;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: TABLE assets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.assets IS 'Physical and digital assets (laptops, phones, licenses, etc.)';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    action public.audit_action NOT NULL,
    resource character varying(255) NOT NULL,
    resource_id uuid,
    details jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: available_modules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.available_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_key character varying(100) NOT NULL,
    module_name character varying(255) NOT NULL,
    module_type character varying(50) NOT NULL,
    description text,
    version character varying(50) DEFAULT '1.0.0'::character varying,
    is_core boolean DEFAULT false,
    requires_modules jsonb,
    config_schema jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.available_modules OWNER TO postgres;

--
-- Name: bulk_operation_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bulk_operation_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bulk_operation_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    details jsonb,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.bulk_operation_audit OWNER TO postgres;

--
-- Name: TABLE bulk_operation_audit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.bulk_operation_audit IS 'Audit trail for bulk operation lifecycle events';


--
-- Name: bulk_operation_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bulk_operation_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    operation_type character varying(50) NOT NULL,
    template_data jsonb NOT NULL,
    is_shared boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.bulk_operation_templates OWNER TO postgres;

--
-- Name: TABLE bulk_operation_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.bulk_operation_templates IS 'Reusable templates for common bulk operations';


--
-- Name: bulk_operations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bulk_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    operation_type character varying(50) NOT NULL,
    operation_name character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_items integer DEFAULT 0 NOT NULL,
    processed_items integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    input_data jsonb,
    results jsonb,
    error_message text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT valid_counts CHECK (((processed_items >= 0) AND (processed_items <= total_items) AND (success_count >= 0) AND (failure_count >= 0) AND ((success_count + failure_count) <= processed_items))),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.bulk_operations OWNER TO postgres;

--
-- Name: TABLE bulk_operations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.bulk_operations IS 'Tracks bulk operations performed on users, groups, and other resources';


--
-- Name: COLUMN bulk_operations.operation_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bulk_operations.operation_type IS 'Type of bulk operation: user_update, user_create, user_delete, user_suspend, group_membership_add, group_membership_remove, org_unit_move';


--
-- Name: COLUMN bulk_operations.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bulk_operations.status IS 'Current status: pending (queued), processing (running), completed (finished successfully), failed (error occurred), cancelled (manually stopped)';


--
-- Name: COLUMN bulk_operations.input_data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bulk_operations.input_data IS 'Original input data including CSV content, filters, or selection criteria';


--
-- Name: COLUMN bulk_operations.results; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bulk_operations.results IS 'Per-item results array with success/failure status and error messages';


--
-- Name: campaign_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    total_users integer DEFAULT 0,
    emails_sent integer DEFAULT 0,
    emails_opened integer DEFAULT 0,
    links_clicked integer DEFAULT 0,
    unique_openers integer DEFAULT 0,
    unique_clickers integer DEFAULT 0,
    open_rate numeric(5,2),
    click_rate numeric(5,2),
    click_to_open_rate numeric(5,2),
    geo_distribution jsonb,
    email_client_stats jsonb,
    device_stats jsonb,
    first_event_at timestamp without time zone,
    last_event_at timestamp without time zone,
    last_aggregated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.campaign_analytics OWNER TO postgres;

--
-- Name: contacts; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.contacts AS
 SELECT id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    department,
    is_active,
    email_verified,
    last_login,
    password_reset_token,
    password_reset_expires,
    email_verification_token,
    two_factor_enabled,
    two_factor_secret,
    created_at,
    updated_at,
    alternate_email,
    password_setup_method,
    scheduled_creation_date,
    sync_to_google,
    sync_to_microsoft365,
    job_title,
    organizational_unit,
    location,
    reporting_manager_id,
    employee_id,
    employee_type,
    cost_center,
    start_date,
    end_date,
    bio,
    mobile_phone,
    work_phone,
    work_phone_extension,
    timezone,
    preferred_language,
    google_workspace_id,
    microsoft_365_id,
    github_username,
    slack_user_id,
    jumpcloud_user_id,
    associate_id,
    google_workspace_sync_status,
    google_workspace_last_sync,
    microsoft_365_sync_status,
    microsoft_365_last_sync,
    custom_fields,
    avatar_url,
    photo_data,
    department_id,
    professional_designations,
    pronouns,
    user_linkedin_url,
    user_twitter_url,
    user_github_url,
    user_portfolio_url,
    user_instagram_url,
    user_facebook_url,
    avatar_asset_id,
    avatar_url_50,
    avatar_url_100,
    avatar_url_200,
    avatar_url_400,
    deleted_at,
    user_status,
    is_guest,
    guest_expires_at,
    guest_invited_by,
    guest_invited_at,
    user_type,
    company,
    contact_tags,
    added_by,
    added_at,
    blocked_at,
    blocked_by,
    blocked_reason
   FROM public.organization_users
  WHERE ((user_type = 'contact'::public.user_type_enum) AND (deleted_at IS NULL));


ALTER VIEW public.contacts OWNER TO postgres;

--
-- Name: user_assets; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.user_assets OWNER TO postgres;

--
-- Name: TABLE user_assets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_assets IS 'Assignment of assets to users with tracking';


--
-- Name: current_user_assets; Type: VIEW; Schema: public; Owner: postgres
--

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


ALTER VIEW public.current_user_assets OWNER TO postgres;

--
-- Name: custom_labels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    canonical_name character varying(100) NOT NULL,
    label_singular character varying(30) NOT NULL,
    label_plural character varying(30) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT custom_labels_label_plural_check CHECK ((char_length((label_plural)::text) <= 30)),
    CONSTRAINT custom_labels_label_plural_check1 CHECK (((label_plural)::text <> ''::text)),
    CONSTRAINT custom_labels_label_singular_check CHECK ((char_length((label_singular)::text) <= 30)),
    CONSTRAINT custom_labels_label_singular_check1 CHECK (((label_singular)::text <> ''::text))
);


ALTER TABLE public.custom_labels OWNER TO postgres;

--
-- Name: TABLE custom_labels; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.custom_labels IS 'Stores tenant-customizable display labels for canonical entities (e.g., "People" for entity.user)';


--
-- Name: COLUMN custom_labels.canonical_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.custom_labels.canonical_name IS 'Immutable system identifier (e.g., entity.user, entity.workspace)';


--
-- Name: COLUMN custom_labels.label_singular; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.custom_labels.label_singular IS 'Singular form for UI (e.g., "Person", "Pod", "Team")';


--
-- Name: COLUMN custom_labels.label_plural; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.custom_labels.label_plural IS 'Plural form for UI (e.g., "People", "Pods", "Teams")';


--
-- Name: gw_synced_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gw_synced_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


ALTER TABLE public.gw_synced_users OWNER TO postgres;

--
-- Name: organization_modules; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.organization_modules OWNER TO postgres;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    domain character varying(255) NOT NULL,
    logo text,
    primary_color character varying(7),
    secondary_color character varying(7),
    is_setup_complete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    company_linkedin_url character varying(500),
    company_twitter_url character varying(500),
    company_facebook_url character varying(500),
    company_instagram_url character varying(500),
    company_youtube_url character varying(500),
    company_tiktok_url character varying(500),
    company_website_url character varying(500),
    company_blog_url character varying(500),
    company_logo_asset_id uuid,
    company_tagline text,
    company_address text,
    company_phone character varying(50),
    company_email character varying(255),
    company_logo_url_50 character varying(500),
    company_logo_url_100 character varying(500),
    company_logo_url_200 character varying(500),
    company_logo_url_400 character varying(500)
);


ALTER TABLE public.organizations OWNER TO postgres;

--
-- Name: COLUMN organizations.company_linkedin_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organizations.company_linkedin_url IS 'Company LinkedIn page URL';


--
-- Name: COLUMN organizations.company_website_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organizations.company_website_url IS 'Company main website URL';


--
-- Name: COLUMN organizations.company_logo_asset_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.organizations.company_logo_asset_id IS 'Reference to company logo in public_assets';


--
-- Name: dashboard_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.dashboard_stats AS
 SELECT id AS organization_id,
    name AS organization_name,
    ( SELECT count(*) AS count
           FROM public.organization_users
          WHERE ((organization_users.organization_id = o.id) AND (organization_users.is_active = true))) AS total_users,
    ( SELECT count(*) AS count
           FROM public.organization_users
          WHERE ((organization_users.organization_id = o.id) AND (organization_users.role = 'admin'::public.user_role))) AS admin_users,
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


ALTER VIEW public.dashboard_stats OWNER TO postgres;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

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
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    gw_group_id character varying(255),
    gw_group_email character varying(255),
    auto_sync_to_group boolean DEFAULT false,
    CONSTRAINT departments_check CHECK ((parent_department_id <> id))
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: TABLE departments; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.departments IS 'Local department management with optional Google Workspace OU mapping';


--
-- Name: COLUMN departments.parent_department_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.departments.parent_department_id IS 'Allows hierarchical department structure';


--
-- Name: COLUMN departments.org_unit_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.departments.org_unit_id IS 'Optional mapping to Google Workspace organizational unit';


--
-- Name: COLUMN departments.auto_sync_to_ou; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.departments.auto_sync_to_ou IS 'When true, users assigned to this department are automatically synced to the mapped OU';


--
-- Name: COLUMN departments.gw_group_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.departments.gw_group_id IS 'Optional mapping to Google Workspace group';


--
-- Name: COLUMN departments.auto_sync_to_group; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.departments.auto_sync_to_group IS 'When true, users assigned to this department are automatically added to the mapped group';


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(100) NOT NULL,
    subject character varying(255) NOT NULL,
    body text NOT NULL,
    template_type character varying(50) NOT NULL,
    is_default boolean DEFAULT false,
    variables jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


ALTER TABLE public.email_templates OWNER TO postgres;

--
-- Name: TABLE email_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.email_templates IS 'Email templates for automated user communications';


--
-- Name: file_drop_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_drop_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drop_zone_id uuid,
    upload_id uuid,
    organization_id uuid NOT NULL,
    activity_type character varying(50) NOT NULL,
    actor_type character varying(50) NOT NULL,
    actor_email character varying(255),
    actor_ip character varying(45),
    details jsonb,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.file_drop_activity OWNER TO postgres;

--
-- Name: TABLE file_drop_activity; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.file_drop_activity IS 'Audit trail for file drop zone activities';


--
-- Name: file_drop_uploads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_drop_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drop_zone_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    original_filename character varying(255) NOT NULL,
    stored_filename character varying(255) NOT NULL,
    file_path text NOT NULL,
    mime_type character varying(100),
    file_size_bytes bigint NOT NULL,
    sender_email character varying(255),
    sender_name character varying(255),
    sender_ip character varying(45),
    sender_message text,
    status character varying(50) DEFAULT 'pending'::character varying,
    google_drive_file_id character varying(255),
    google_drive_url text,
    virus_scan_status character varying(50),
    virus_scan_details text,
    downloaded_by uuid,
    downloaded_at timestamp without time zone,
    download_count integer DEFAULT 0,
    uploaded_at timestamp without time zone DEFAULT now(),
    processed_at timestamp without time zone,
    expires_at timestamp without time zone,
    deleted_at timestamp without time zone
);


ALTER TABLE public.file_drop_uploads OWNER TO postgres;

--
-- Name: TABLE file_drop_uploads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.file_drop_uploads IS 'Files uploaded by external parties through drop zones';


--
-- Name: file_drop_zones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_drop_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    zone_name character varying(255) NOT NULL,
    description text,
    public_token character varying(64) NOT NULL,
    created_by uuid,
    is_organization_wide boolean DEFAULT false,
    password_hash character varying(255),
    requires_email boolean DEFAULT true,
    allowed_file_types text[],
    max_file_size_mb integer DEFAULT 100,
    max_files_per_upload integer DEFAULT 10,
    is_active boolean DEFAULT true,
    expires_at timestamp without time zone,
    upload_count integer DEFAULT 0,
    max_uploads integer,
    google_drive_enabled boolean DEFAULT false,
    google_drive_folder_id character varying(255),
    google_shared_drive_id character varying(255),
    notify_on_upload boolean DEFAULT true,
    notification_emails text[],
    custom_message text,
    custom_button_text character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_upload_at timestamp without time zone
);


ALTER TABLE public.file_drop_zones OWNER TO postgres;

--
-- Name: TABLE file_drop_zones; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.file_drop_zones IS 'Secure zones for receiving files from external parties';


--
-- Name: gw_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gw_credentials (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


ALTER TABLE public.gw_credentials OWNER TO postgres;

--
-- Name: gw_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gw_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


ALTER TABLE public.gw_groups OWNER TO postgres;

--
-- Name: gw_org_units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gw_org_units (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


ALTER TABLE public.gw_org_units OWNER TO postgres;

--
-- Name: helpdesk_analytics_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_analytics_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    date date NOT NULL,
    agent_id uuid,
    tickets_created integer DEFAULT 0,
    tickets_resolved integer DEFAULT 0,
    tickets_reopened integer DEFAULT 0,
    first_responses integer DEFAULT 0,
    avg_response_time_seconds integer,
    avg_resolution_time_seconds integer,
    sla_met_count integer DEFAULT 0,
    sla_breach_count integer DEFAULT 0,
    internal_notes_count integer DEFAULT 0
);


ALTER TABLE public.helpdesk_analytics_daily OWNER TO postgres;

--
-- Name: TABLE helpdesk_analytics_daily; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_analytics_daily IS 'Pre-aggregated daily metrics for performance';


--
-- Name: helpdesk_assignment_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_assignment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    assigned_from uuid,
    assigned_to uuid,
    assigned_by uuid NOT NULL,
    reason character varying(255),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.helpdesk_assignment_history OWNER TO postgres;

--
-- Name: TABLE helpdesk_assignment_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_assignment_history IS 'Audit trail of ticket assignments';


--
-- Name: helpdesk_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    mentioned_users uuid[] DEFAULT ARRAY[]::uuid[],
    is_edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.helpdesk_notes OWNER TO postgres;

--
-- Name: TABLE helpdesk_notes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_notes IS 'Internal team notes not sent to customers';


--
-- Name: helpdesk_presence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    socket_id character varying(255),
    started_at timestamp with time zone DEFAULT now(),
    last_ping timestamp with time zone DEFAULT now(),
    CONSTRAINT helpdesk_presence_action_check CHECK (((action)::text = ANY ((ARRAY['viewing'::character varying, 'typing'::character varying, 'composing'::character varying])::text[])))
);


ALTER TABLE public.helpdesk_presence OWNER TO postgres;

--
-- Name: TABLE helpdesk_presence; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_presence IS 'Real-time agent presence tracking for collision prevention';


--
-- Name: helpdesk_sla_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_sla_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    conditions jsonb NOT NULL,
    response_time_minutes integer NOT NULL,
    resolution_time_minutes integer NOT NULL,
    business_hours_only boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.helpdesk_sla_rules OWNER TO postgres;

--
-- Name: TABLE helpdesk_sla_rules; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_sla_rules IS 'Service level agreement rules and deadlines';


--
-- Name: helpdesk_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(255),
    content text NOT NULL,
    category character varying(100),
    shortcuts character varying(50),
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.helpdesk_templates OWNER TO postgres;

--
-- Name: TABLE helpdesk_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_templates IS 'Reusable response templates for common replies';


--
-- Name: helpdesk_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpdesk_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    google_message_id character varying(255) NOT NULL,
    google_thread_id character varying(255) NOT NULL,
    group_email character varying(255) NOT NULL,
    subject text,
    sender_email character varying(255),
    sender_name character varying(255),
    status character varying(50) DEFAULT 'new'::character varying,
    priority character varying(20) DEFAULT 'normal'::character varying,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    assigned_by uuid,
    first_response_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    reopened_at timestamp with time zone,
    sla_deadline timestamp with time zone,
    tags jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT helpdesk_tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT helpdesk_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'in_progress'::character varying, 'pending'::character varying, 'resolved'::character varying, 'reopened'::character varying])::text[])))
);


ALTER TABLE public.helpdesk_tickets OWNER TO postgres;

--
-- Name: TABLE helpdesk_tickets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.helpdesk_tickets IS 'Support ticket metadata synchronized with Google Groups emails';


--
-- Name: icon_library; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.icon_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    icon_key character varying(100) NOT NULL,
    icon_category character varying(50) NOT NULL,
    icon_name character varying(100) NOT NULL,
    icon_style character varying(50) NOT NULL,
    file_path character varying(500) NOT NULL,
    public_url character varying(500) NOT NULL,
    cdn_url character varying(500),
    file_format character varying(20) NOT NULL,
    file_size_bytes bigint,
    width integer,
    height integer,
    is_system_icon boolean DEFAULT true,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    description text,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.icon_library OWNER TO postgres;

--
-- Name: TABLE icon_library; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.icon_library IS 'Library of reusable icons including social media icons';


--
-- Name: COLUMN icon_library.icon_key; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.icon_library.icon_key IS 'Unique identifier like "linkedin.square" or "twitter.round"';


--
-- Name: COLUMN icon_library.icon_style; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.icon_library.icon_style IS 'Visual style: square, round, brand, mono, color';


--
-- Name: COLUMN icon_library.is_system_icon; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.icon_library.is_system_icon IS 'True for system-provided icons, false for custom uploads';


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    migration_name character varying(255) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: module_entity_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.module_entity_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_key character varying(100) NOT NULL,
    entity_canonical_name character varying(100) NOT NULL,
    is_primary_provider boolean DEFAULT false
);


ALTER TABLE public.module_entity_providers OWNER TO postgres;

--
-- Name: TABLE module_entity_providers; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.module_entity_providers IS 'Defines which modules provide which canonical entities';


--
-- Name: modules; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.modules OWNER TO postgres;

--
-- Name: organization_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    key character varying(255) NOT NULL,
    value text,
    is_sensitive boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.organization_settings OWNER TO postgres;

--
-- Name: password_setup_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_setup_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


ALTER TABLE public.password_setup_tokens OWNER TO postgres;

--
-- Name: TABLE password_setup_tokens; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.password_setup_tokens IS 'Stores tokens for new user password setup links';


--
-- Name: photo_sizes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.photo_sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_asset_id uuid NOT NULL,
    size_key character varying(50) NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    file_path character varying(500) NOT NULL,
    public_url character varying(500) NOT NULL,
    cdn_url character varying(500),
    file_format character varying(20) NOT NULL,
    file_size_bytes bigint NOT NULL,
    is_optimized boolean DEFAULT false,
    quality integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.photo_sizes OWNER TO postgres;

--
-- Name: TABLE photo_sizes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.photo_sizes IS 'Multiple size variations for photos (avatars, logos)';


--
-- Name: COLUMN photo_sizes.size_key; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.photo_sizes.size_key IS 'Size identifier: 50, 100, 200, 400, or original';


--
-- Name: COLUMN photo_sizes.is_optimized; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.photo_sizes.is_optimized IS 'True if image has been optimized/compressed';


--
-- Name: platform_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    platform_key character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    icon character varying(100),
    description text,
    field_label character varying(255) NOT NULL,
    field_type character varying(50) DEFAULT 'text'::character varying,
    is_required boolean DEFAULT false,
    validation_regex character varying(500),
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid
);


ALTER TABLE public.platform_integrations OWNER TO postgres;

--
-- Name: TABLE platform_integrations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.platform_integrations IS 'Extensible platform integrations with custom display names';


--
-- Name: public_assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.public_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    usage_count integer DEFAULT 0,
    download_count integer DEFAULT 0,
    last_accessed_at timestamp without time zone,
    is_active boolean DEFAULT true,
    tags jsonb,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    has_sizes boolean DEFAULT false,
    default_size_key character varying(50) DEFAULT '200'::character varying,
    is_profile_photo boolean DEFAULT false,
    is_company_logo boolean DEFAULT false,
    aspect_ratio numeric(5,2)
);


ALTER TABLE public.public_assets OWNER TO postgres;

--
-- Name: COLUMN public_assets.has_sizes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.public_assets.has_sizes IS 'True if photo has multiple size variations in photo_sizes table';


--
-- Name: COLUMN public_assets.aspect_ratio; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.public_assets.aspect_ratio IS 'Width/height ratio (1.00 for square)';


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    user_id uuid,
    user_email character varying(255),
    resource_type character varying(50),
    resource_id character varying(255),
    title character varying(255),
    description text,
    details jsonb DEFAULT '{}'::jsonb,
    source character varying(50) DEFAULT 'helios'::character varying,
    ip_address inet,
    user_agent text,
    acknowledged boolean DEFAULT false,
    acknowledged_by uuid,
    acknowledged_at timestamp without time zone,
    acknowledged_note text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT security_events_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.security_events OWNER TO postgres;

--
-- Name: TABLE security_events; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.security_events IS 'Security-relevant events requiring admin attention';


--
-- Name: COLUMN security_events.event_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.security_events.event_type IS 'Type of event: blocked_user_login_attempt, external_delegate_added, etc.';


--
-- Name: COLUMN security_events.severity; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.security_events.severity IS 'Event severity: info (informational), warning (needs attention), critical (immediate action)';


--
-- Name: COLUMN security_events.source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.security_events.source IS 'Where event originated: helios, google_workspace, sync, etc.';


--
-- Name: signature_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.signature_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    template_id uuid NOT NULL,
    assignment_type character varying(50) NOT NULL,
    assignment_value character varying(255),
    priority integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.signature_assignments OWNER TO postgres;

--
-- Name: signature_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.signature_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    template_id uuid NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    target_type character varying(50) NOT NULL,
    target_value jsonb,
    status character varying(50) DEFAULT 'draft'::character varying,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp without time zone,
    approval_notes text,
    deployed_at timestamp without time zone,
    reverted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT signature_campaigns_check CHECK ((end_date > start_date))
);


ALTER TABLE public.signature_campaigns OWNER TO postgres;

--
-- Name: signature_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.signature_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    html_content text NOT NULL,
    mobile_html_content text,
    plain_text_content text,
    thumbnail_asset_id uuid,
    category character varying(100),
    variables_used jsonb,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    module_scope jsonb DEFAULT '[]'::jsonb,
    template_type character varying(100),
    template_category character varying(100) DEFAULT 'email_signatures'::character varying,
    is_system_template boolean DEFAULT false
);


ALTER TABLE public.signature_templates OWNER TO postgres;

--
-- Name: TABLE signature_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.signature_templates IS 'Email signature templates with support for multiple types and system templates';


--
-- Name: COLUMN signature_templates.module_scope; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.signature_templates.module_scope IS 'Array of module keys that can use this template. Empty array means all modules can use it.';


--
-- Name: COLUMN signature_templates.is_system_template; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.signature_templates.is_system_template IS 'True for pre-built templates provided by the system';


--
-- Name: smtp_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.smtp_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    host character varying(255) NOT NULL,
    port integer NOT NULL,
    secure boolean DEFAULT true,
    username character varying(255) NOT NULL,
    password_encrypted text NOT NULL,
    from_email character varying(255) NOT NULL,
    from_name character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.smtp_settings OWNER TO postgres;

--
-- Name: TABLE smtp_settings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.smtp_settings IS 'SMTP configuration for sending emails (per organization)';


--
-- Name: template_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    template_id uuid NOT NULL,
    template_type character varying(100),
    target_type character varying(50) NOT NULL,
    target_user_id uuid,
    target_department_id uuid,
    target_group_email character varying(255),
    target_org_unit_path text,
    priority integer DEFAULT 5 NOT NULL,
    is_active boolean DEFAULT true,
    activation_date timestamp with time zone,
    expiration_date timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_single_target CHECK (((((target_type)::text = 'organization'::text) AND (target_user_id IS NULL) AND (target_department_id IS NULL) AND (target_group_email IS NULL) AND (target_org_unit_path IS NULL)) OR (((target_type)::text = 'user'::text) AND (target_user_id IS NOT NULL) AND (target_department_id IS NULL) AND (target_group_email IS NULL) AND (target_org_unit_path IS NULL)) OR (((target_type)::text = 'department'::text) AND (target_user_id IS NULL) AND (target_department_id IS NOT NULL) AND (target_group_email IS NULL) AND (target_org_unit_path IS NULL)) OR (((target_type)::text = 'google_group'::text) AND (target_user_id IS NULL) AND (target_department_id IS NULL) AND (target_group_email IS NOT NULL) AND (target_org_unit_path IS NULL)) OR (((target_type)::text = 'org_unit'::text) AND (target_user_id IS NULL) AND (target_department_id IS NULL) AND (target_group_email IS NULL) AND (target_org_unit_path IS NOT NULL)) OR (((target_type)::text = 'microsoft_group'::text) AND (target_user_id IS NULL) AND (target_department_id IS NULL) AND (target_group_email IS NOT NULL) AND (target_org_unit_path IS NULL)))),
    CONSTRAINT template_assignments_priority_check CHECK (((priority >= 1) AND (priority <= 5))),
    CONSTRAINT template_assignments_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['organization'::character varying, 'user'::character varying, 'department'::character varying, 'google_group'::character varying, 'org_unit'::character varying, 'microsoft_group'::character varying])::text[])))
);


ALTER TABLE public.template_assignments OWNER TO postgres;

--
-- Name: TABLE template_assignments; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.template_assignments IS 'Permanent rules defining who gets which template (priority-based)';


--
-- Name: COLUMN template_assignments.priority; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.template_assignments.priority IS 'Priority level: 1=User, 2=Department, 3=Group, 4=OrgUnit, 5=Organization (lower number wins)';


--
-- Name: template_campaign_targets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_campaign_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    target_type character varying(50) NOT NULL,
    target_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.template_campaign_targets OWNER TO postgres;

--
-- Name: TABLE template_campaign_targets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.template_campaign_targets IS 'Maps campaigns to specific users/groups for complex targeting';


--
-- Name: template_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    template_id uuid NOT NULL,
    template_type character varying(100),
    campaign_name character varying(255) NOT NULL,
    campaign_description text,
    target_type character varying(50) NOT NULL,
    target_user_id uuid,
    target_department_id uuid,
    target_group_email character varying(255),
    target_org_unit_path text,
    target_multiple jsonb,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    timezone character varying(100) DEFAULT 'UTC'::character varying,
    revert_to_previous boolean DEFAULT true,
    previous_template_id uuid,
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    requires_approval boolean DEFAULT false,
    approver_id uuid,
    approved_at timestamp with time zone,
    approval_notes text,
    users_affected integer DEFAULT 0,
    deployments_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_dates CHECK ((end_date > start_date)),
    CONSTRAINT template_campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT template_campaigns_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['organization'::character varying, 'user'::character varying, 'department'::character varying, 'google_group'::character varying, 'org_unit'::character varying, 'microsoft_group'::character varying, 'multiple'::character varying])::text[])))
);


ALTER TABLE public.template_campaigns OWNER TO postgres;

--
-- Name: TABLE template_campaigns; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.template_campaigns IS 'Time-based template deployments that override permanent assignments';


--
-- Name: COLUMN template_campaigns.revert_to_previous; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.template_campaigns.revert_to_previous IS 'If true, revert to previous template after campaign ends';


--
-- Name: COLUMN template_campaigns.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.template_campaigns.status IS 'Campaign lifecycle: draft -> scheduled -> active -> completed/cancelled';


--
-- Name: template_deployment_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_deployment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    template_id uuid NOT NULL,
    deployment_source character varying(50) NOT NULL,
    assignment_id uuid,
    campaign_id uuid,
    deployed_at timestamp with time zone DEFAULT now(),
    deployed_by uuid,
    deployment_status character varying(50) DEFAULT 'success'::character varying,
    error_message text,
    google_deployment_id character varying(255),
    microsoft_deployment_id character varying(255),
    CONSTRAINT template_deployment_history_deployment_source_check CHECK (((deployment_source)::text = ANY ((ARRAY['assignment'::character varying, 'campaign'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT template_deployment_history_deployment_status_check CHECK (((deployment_status)::text = ANY ((ARRAY['success'::character varying, 'failed'::character varying, 'pending'::character varying])::text[])))
);


ALTER TABLE public.template_deployment_history OWNER TO postgres;

--
-- Name: TABLE template_deployment_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.template_deployment_history IS 'Audit trail of all template deployments to users';


--
-- Name: template_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_key character varying(100) NOT NULL,
    type_label character varying(255) NOT NULL,
    module_key character varying(100) NOT NULL,
    category character varying(100) NOT NULL,
    icon_name character varying(100),
    supported_variables jsonb DEFAULT '[]'::jsonb,
    required_fields jsonb DEFAULT '["html_content"]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.template_types OWNER TO postgres;

--
-- Name: TABLE template_types; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.template_types IS 'Defines available template types based on enabled modules (Gmail Signature, Outlook Signature, Landing Page, etc.)';


--
-- Name: tracking_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tracking_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    result_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    details jsonb,
    ip_address character varying(45),
    latitude numeric(10,8),
    longitude numeric(11,8),
    city character varying(255),
    country character varying(2),
    occurred_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tracking_events OWNER TO postgres;

--
-- Name: tracking_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tracking_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rid character varying(7) NOT NULL,
    pixel_url character varying(500) NOT NULL,
    link_token character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'sent'::character varying,
    deployed_at timestamp without time zone,
    reverted_at timestamp without time zone,
    deployment_status character varying(50),
    last_event_at timestamp without time zone,
    ip_address character varying(45),
    latitude numeric(10,8),
    longitude numeric(11,8),
    city character varying(255),
    country character varying(2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tracking_results OWNER TO postgres;

--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.user_addresses OWNER TO postgres;

--
-- Name: TABLE user_addresses; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_addresses IS 'Physical addresses for users (work, home, shipping)';


--
-- Name: user_group_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_group_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying,
    joined_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_group_memberships OWNER TO postgres;

--
-- Name: TABLE user_group_memberships; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_group_memberships IS 'Many-to-many relationship between users and groups';


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    email character varying(255),
    group_type character varying(50) DEFAULT 'security'::character varying,
    is_active boolean DEFAULT true,
    google_workspace_group_id character varying(255),
    microsoft_365_group_id character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_groups OWNER TO postgres;

--
-- Name: TABLE user_groups; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_groups IS 'Groups/teams that users can belong to (security groups, distribution lists, teams)';


--
-- Name: user_platform_ids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_platform_ids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform_integration_id uuid NOT NULL,
    value character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_platform_ids OWNER TO postgres;

--
-- Name: TABLE user_platform_ids; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_platform_ids IS 'User values for custom platform integrations';


--
-- Name: user_secondary_emails; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_secondary_emails (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    email_type character varying(50) DEFAULT 'personal'::character varying,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_secondary_emails OWNER TO postgres;

--
-- Name: TABLE user_secondary_emails; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_secondary_emails IS 'Additional email addresses for a user (personal, recovery, alternate work emails)';


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: user_signatures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    current_template_id uuid,
    deployment_status character varying(50),
    last_deployed_at timestamp without time zone,
    deployment_error text,
    google_workspace_signature_id character varying(255),
    microsoft_365_signature_id character varying(255),
    allow_user_selection boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_signatures OWNER TO postgres;

--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    joined_at timestamp without time zone DEFAULT now(),
    removed_at timestamp without time zone,
    synced_from_platform boolean DEFAULT true
);


ALTER TABLE public.workspace_members OWNER TO postgres;

--
-- Name: TABLE workspace_members; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.workspace_members IS 'Members of collaboration workspaces with roles (owner, admin, member, guest)';


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

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
    archived_at timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp without time zone DEFAULT now(),
    synced_at timestamp without time zone
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- Name: TABLE workspaces; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.workspaces IS 'Collaboration spaces (Microsoft Teams, Google Chat Spaces). Full environments with chat, files, tasks.';


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: access_group_members access_group_members_access_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_access_group_id_user_id_key UNIQUE (access_group_id, user_id);


--
-- Name: access_group_members access_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_pkey PRIMARY KEY (id);


--
-- Name: access_groups access_groups_organization_id_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_organization_id_platform_external_id_key UNIQUE (organization_id, platform, external_id);


--
-- Name: access_groups access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: api_key_usage_logs api_key_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: asset_access_logs asset_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_access_logs
    ADD CONSTRAINT asset_access_logs_pkey PRIMARY KEY (id);


--
-- Name: asset_usage asset_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_usage
    ADD CONSTRAINT asset_usage_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: available_modules available_modules_module_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.available_modules
    ADD CONSTRAINT available_modules_module_key_key UNIQUE (module_key);


--
-- Name: available_modules available_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.available_modules
    ADD CONSTRAINT available_modules_pkey PRIMARY KEY (id);


--
-- Name: bulk_operation_audit bulk_operation_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_audit
    ADD CONSTRAINT bulk_operation_audit_pkey PRIMARY KEY (id);


--
-- Name: bulk_operation_templates bulk_operation_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_templates
    ADD CONSTRAINT bulk_operation_templates_pkey PRIMARY KEY (id);


--
-- Name: bulk_operations bulk_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_pkey PRIMARY KEY (id);


--
-- Name: campaign_analytics campaign_analytics_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_campaign_id_key UNIQUE (campaign_id);


--
-- Name: campaign_analytics campaign_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_pkey PRIMARY KEY (id);


--
-- Name: custom_labels custom_labels_organization_id_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_organization_id_canonical_name_key UNIQUE (organization_id, canonical_name);


--
-- Name: custom_labels custom_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_pkey PRIMARY KEY (id);


--
-- Name: departments departments_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: file_drop_activity file_drop_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_activity
    ADD CONSTRAINT file_drop_activity_pkey PRIMARY KEY (id);


--
-- Name: file_drop_uploads file_drop_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_uploads
    ADD CONSTRAINT file_drop_uploads_pkey PRIMARY KEY (id);


--
-- Name: file_drop_zones file_drop_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_zones
    ADD CONSTRAINT file_drop_zones_pkey PRIMARY KEY (id);


--
-- Name: file_drop_zones file_drop_zones_public_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_zones
    ADD CONSTRAINT file_drop_zones_public_token_key UNIQUE (public_token);


--
-- Name: gw_credentials gw_credentials_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_organization_id_key UNIQUE (organization_id);


--
-- Name: gw_credentials gw_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_pkey PRIMARY KEY (id);


--
-- Name: gw_groups gw_groups_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_organization_id_google_id_key UNIQUE (organization_id, google_id);


--
-- Name: gw_groups gw_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_pkey PRIMARY KEY (id);


--
-- Name: gw_org_units gw_org_units_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_organization_id_google_id_key UNIQUE (organization_id, google_id);


--
-- Name: gw_org_units gw_org_units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_pkey PRIMARY KEY (id);


--
-- Name: gw_synced_users gw_synced_users_organization_id_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_organization_id_google_id_key UNIQUE (organization_id, google_id);


--
-- Name: gw_synced_users gw_synced_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_analytics_daily helpdesk_analytics_daily_organization_id_date_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_analytics_daily
    ADD CONSTRAINT helpdesk_analytics_daily_organization_id_date_agent_id_key UNIQUE (organization_id, date, agent_id);


--
-- Name: helpdesk_analytics_daily helpdesk_analytics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_analytics_daily
    ADD CONSTRAINT helpdesk_analytics_daily_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_assignment_history helpdesk_assignment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_assignment_history
    ADD CONSTRAINT helpdesk_assignment_history_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_notes helpdesk_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_notes
    ADD CONSTRAINT helpdesk_notes_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_presence helpdesk_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_presence
    ADD CONSTRAINT helpdesk_presence_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_presence helpdesk_presence_user_id_ticket_id_action_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_presence
    ADD CONSTRAINT helpdesk_presence_user_id_ticket_id_action_key UNIQUE (user_id, ticket_id, action);


--
-- Name: helpdesk_sla_rules helpdesk_sla_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_sla_rules
    ADD CONSTRAINT helpdesk_sla_rules_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_templates helpdesk_templates_organization_id_shortcuts_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_templates
    ADD CONSTRAINT helpdesk_templates_organization_id_shortcuts_key UNIQUE (organization_id, shortcuts);


--
-- Name: helpdesk_templates helpdesk_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_templates
    ADD CONSTRAINT helpdesk_templates_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_tickets helpdesk_tickets_google_message_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_google_message_id_key UNIQUE (google_message_id);


--
-- Name: helpdesk_tickets helpdesk_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_pkey PRIMARY KEY (id);


--
-- Name: icon_library icon_library_icon_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.icon_library
    ADD CONSTRAINT icon_library_icon_key_key UNIQUE (icon_key);


--
-- Name: icon_library icon_library_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.icon_library
    ADD CONSTRAINT icon_library_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_migration_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_migration_name_key UNIQUE (migration_name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: module_entity_providers module_entity_providers_module_key_entity_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_entity_providers
    ADD CONSTRAINT module_entity_providers_module_key_entity_canonical_name_key UNIQUE (module_key, entity_canonical_name);


--
-- Name: module_entity_providers module_entity_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_entity_providers
    ADD CONSTRAINT module_entity_providers_pkey PRIMARY KEY (id);


--
-- Name: modules modules_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_name_key UNIQUE (name);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- Name: modules modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_slug_key UNIQUE (slug);


--
-- Name: organization_modules organization_modules_organization_id_module_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_organization_id_module_id_key UNIQUE (organization_id, module_id);


--
-- Name: organization_modules organization_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_pkey PRIMARY KEY (id);


--
-- Name: organization_settings organization_settings_organization_id_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_organization_id_key_key UNIQUE (organization_id, key);


--
-- Name: organization_settings organization_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_email_key UNIQUE (email);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: password_setup_tokens password_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_setup_tokens password_setup_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_token_key UNIQUE (token);


--
-- Name: photo_sizes photo_sizes_original_asset_id_size_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.photo_sizes
    ADD CONSTRAINT photo_sizes_original_asset_id_size_key_key UNIQUE (original_asset_id, size_key);


--
-- Name: photo_sizes photo_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.photo_sizes
    ADD CONSTRAINT photo_sizes_pkey PRIMARY KEY (id);


--
-- Name: platform_integrations platform_integrations_organization_id_platform_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_organization_id_platform_key_key UNIQUE (organization_id, platform_key);


--
-- Name: platform_integrations platform_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_pkey PRIMARY KEY (id);


--
-- Name: public_assets public_assets_organization_id_asset_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_assets
    ADD CONSTRAINT public_assets_organization_id_asset_key_key UNIQUE (organization_id, asset_key);


--
-- Name: public_assets public_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_assets
    ADD CONSTRAINT public_assets_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: signature_assignments signature_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_pkey PRIMARY KEY (id);


--
-- Name: signature_campaigns signature_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_pkey PRIMARY KEY (id);


--
-- Name: signature_templates signature_templates_org_name_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_org_name_type_key UNIQUE (organization_id, name, template_type);


--
-- Name: signature_templates signature_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_pkey PRIMARY KEY (id);


--
-- Name: smtp_settings smtp_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_organization_id_key UNIQUE (organization_id);


--
-- Name: smtp_settings smtp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_pkey PRIMARY KEY (id);


--
-- Name: template_assignments template_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_pkey PRIMARY KEY (id);


--
-- Name: template_campaign_targets template_campaign_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaign_targets
    ADD CONSTRAINT template_campaign_targets_pkey PRIMARY KEY (id);


--
-- Name: template_campaigns template_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_pkey PRIMARY KEY (id);


--
-- Name: template_deployment_history template_deployment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_pkey PRIMARY KEY (id);


--
-- Name: template_types template_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_types
    ADD CONSTRAINT template_types_pkey PRIMARY KEY (id);


--
-- Name: template_types template_types_type_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_types
    ADD CONSTRAINT template_types_type_key_key UNIQUE (type_key);


--
-- Name: tracking_events tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_pkey PRIMARY KEY (id);


--
-- Name: tracking_results tracking_results_campaign_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_campaign_id_user_id_key UNIQUE (campaign_id, user_id);


--
-- Name: tracking_results tracking_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_pkey PRIMARY KEY (id);


--
-- Name: tracking_results tracking_results_rid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_rid_key UNIQUE (rid);


--
-- Name: api_keys unique_org_key_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT unique_org_key_name UNIQUE (organization_id, name);


--
-- Name: bulk_operation_templates unique_template_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_templates
    ADD CONSTRAINT unique_template_name UNIQUE (organization_id, name);


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


--
-- Name: user_assets user_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_pkey PRIMARY KEY (id);


--
-- Name: user_assets user_assets_user_id_asset_id_assigned_at_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_user_id_asset_id_assigned_at_key UNIQUE (user_id, asset_id, assigned_at);


--
-- Name: user_group_memberships user_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_group_memberships user_group_memberships_user_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_user_id_group_id_key UNIQUE (user_id, group_id);


--
-- Name: user_groups user_groups_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_platform_ids user_platform_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platform_ids
    ADD CONSTRAINT user_platform_ids_pkey PRIMARY KEY (id);


--
-- Name: user_platform_ids user_platform_ids_user_id_platform_integration_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platform_ids
    ADD CONSTRAINT user_platform_ids_user_id_platform_integration_id_key UNIQUE (user_id, platform_integration_id);


--
-- Name: user_secondary_emails user_secondary_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_pkey PRIMARY KEY (id);


--
-- Name: user_secondary_emails user_secondary_emails_user_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_user_id_email_key UNIQUE (user_id, email);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_signatures user_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_pkey PRIMARY KEY (id);


--
-- Name: user_signatures user_signatures_user_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_user_id_organization_id_key UNIQUE (user_id, organization_id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


--
-- Name: workspaces workspaces_organization_id_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_organization_id_platform_external_id_key UNIQUE (organization_id, platform, external_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: idx_access_group_members_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (access_group_id);


--
-- Name: idx_access_group_members_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);


--
-- Name: idx_access_groups_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_groups_active ON public.access_groups USING btree (organization_id, is_active) WHERE (is_active = true);


--
-- Name: idx_access_groups_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_groups_email ON public.access_groups USING btree (email);


--
-- Name: idx_access_groups_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_groups_org ON public.access_groups USING btree (organization_id);


--
-- Name: idx_access_groups_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_groups_platform ON public.access_groups USING btree (platform, external_id);


--
-- Name: idx_activity_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_action ON public.activity_logs USING btree (action);


--
-- Name: idx_activity_logs_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_actor ON public.activity_logs USING btree (actor_id) WHERE (actor_id IS NOT NULL);


--
-- Name: idx_activity_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_created ON public.activity_logs USING btree (created_at DESC);


--
-- Name: idx_activity_logs_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_org ON public.activity_logs USING btree (organization_id);


--
-- Name: idx_activity_logs_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_resource ON public.activity_logs USING btree (resource_type, resource_id) WHERE (resource_type IS NOT NULL);


--
-- Name: idx_activity_logs_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_user ON public.activity_logs USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_activity_logs_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_user_created ON public.activity_logs USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: idx_analytics_agent_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_analytics_agent_date ON public.helpdesk_analytics_daily USING btree (agent_id, date DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_analytics_org_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_analytics_org_date ON public.helpdesk_analytics_daily USING btree (organization_id, date DESC);


--
-- Name: idx_api_keys_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (organization_id, is_active) WHERE (is_active = true);


--
-- Name: idx_api_keys_expiration; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_keys_expiration ON public.api_keys USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_api_keys_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_keys_hash ON public.api_keys USING btree (key_hash);


--
-- Name: idx_api_keys_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_keys_org ON public.api_keys USING btree (organization_id);


--
-- Name: idx_api_keys_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_keys_type ON public.api_keys USING btree (organization_id, type);


--
-- Name: idx_api_usage_actor_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_usage_actor_email ON public.api_key_usage_logs USING btree (actor_email, "timestamp" DESC) WHERE (actor_email IS NOT NULL);


--
-- Name: idx_api_usage_key_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_usage_key_timestamp ON public.api_key_usage_logs USING btree (api_key_id, "timestamp" DESC);


--
-- Name: idx_api_usage_result; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_usage_result ON public.api_key_usage_logs USING btree (result, "timestamp" DESC);


--
-- Name: idx_api_usage_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_usage_timestamp ON public.api_key_usage_logs USING btree ("timestamp" DESC);


--
-- Name: idx_asset_access_asset_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asset_access_asset_time ON public.asset_access_logs USING btree (asset_id, accessed_at);


--
-- Name: idx_asset_access_org_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asset_access_org_time ON public.asset_access_logs USING btree (organization_id, accessed_at);


--
-- Name: idx_asset_access_tracking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asset_access_tracking ON public.asset_access_logs USING btree (tracking_result_id);


--
-- Name: idx_asset_usage_asset; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asset_usage_asset ON public.asset_usage USING btree (asset_id);


--
-- Name: idx_asset_usage_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asset_usage_resource ON public.asset_usage USING btree (organization_id, resource_type, resource_id);


--
-- Name: idx_assets_asset_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_asset_tag ON public.assets USING btree (asset_tag);


--
-- Name: idx_assets_custom_fields; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_custom_fields ON public.assets USING gin (custom_fields);


--
-- Name: idx_assets_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_org_id ON public.assets USING btree (organization_id);


--
-- Name: idx_assets_serial_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_serial_number ON public.assets USING btree (serial_number);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


--
-- Name: idx_assignment_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_date ON public.helpdesk_assignment_history USING btree (created_at DESC);


--
-- Name: idx_assignment_ticket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_ticket ON public.helpdesk_assignment_history USING btree (ticket_id);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_org_id ON public.audit_logs USING btree (organization_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_bulk_operation_audit_bulk_op_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operation_audit_bulk_op_id ON public.bulk_operation_audit USING btree (bulk_operation_id);


--
-- Name: idx_bulk_operation_templates_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operation_templates_org_id ON public.bulk_operation_templates USING btree (organization_id);


--
-- Name: idx_bulk_operations_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operations_created_at ON public.bulk_operations USING btree (created_at DESC);


--
-- Name: idx_bulk_operations_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operations_created_by ON public.bulk_operations USING btree (created_by);


--
-- Name: idx_bulk_operations_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operations_org_id ON public.bulk_operations USING btree (organization_id);


--
-- Name: idx_bulk_operations_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bulk_operations_status ON public.bulk_operations USING btree (status);


--
-- Name: idx_campaign_targets_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaign_targets_campaign ON public.template_campaign_targets USING btree (campaign_id);


--
-- Name: idx_campaign_targets_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaign_targets_type_id ON public.template_campaign_targets USING btree (target_type, target_id);


--
-- Name: idx_custom_labels_canonical; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_labels_canonical ON public.custom_labels USING btree (canonical_name);


--
-- Name: idx_custom_labels_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_labels_org ON public.custom_labels USING btree (organization_id);


--
-- Name: idx_departments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_departments_active ON public.departments USING btree (is_active);


--
-- Name: idx_departments_gw_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_departments_gw_group ON public.departments USING btree (gw_group_id);


--
-- Name: idx_departments_org_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_departments_org_unit ON public.departments USING btree (org_unit_id);


--
-- Name: idx_departments_organization; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_departments_organization ON public.departments USING btree (organization_id);


--
-- Name: idx_departments_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_departments_parent ON public.departments USING btree (parent_department_id);


--
-- Name: idx_deployment_history_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deployment_history_campaign ON public.template_deployment_history USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);


--
-- Name: idx_deployment_history_deployed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deployment_history_deployed_at ON public.template_deployment_history USING btree (deployed_at DESC);


--
-- Name: idx_deployment_history_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deployment_history_org ON public.template_deployment_history USING btree (organization_id);


--
-- Name: idx_deployment_history_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deployment_history_template ON public.template_deployment_history USING btree (template_id);


--
-- Name: idx_deployment_history_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deployment_history_user ON public.template_deployment_history USING btree (user_id);


--
-- Name: idx_email_templates_org_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_templates_org_type ON public.email_templates USING btree (organization_id, template_type);


--
-- Name: idx_file_drop_activity_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_activity_created_at ON public.file_drop_activity USING btree (created_at DESC);


--
-- Name: idx_file_drop_activity_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_activity_org ON public.file_drop_activity USING btree (organization_id);


--
-- Name: idx_file_drop_activity_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_activity_zone ON public.file_drop_activity USING btree (drop_zone_id);


--
-- Name: idx_file_drop_uploads_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_uploads_org ON public.file_drop_uploads USING btree (organization_id);


--
-- Name: idx_file_drop_uploads_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_uploads_status ON public.file_drop_uploads USING btree (status);


--
-- Name: idx_file_drop_uploads_uploaded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_uploads_uploaded_at ON public.file_drop_uploads USING btree (uploaded_at DESC);


--
-- Name: idx_file_drop_uploads_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_uploads_zone ON public.file_drop_uploads USING btree (drop_zone_id);


--
-- Name: idx_file_drop_zones_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_zones_active ON public.file_drop_zones USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_file_drop_zones_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_zones_created_by ON public.file_drop_zones USING btree (created_by);


--
-- Name: idx_file_drop_zones_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_zones_org ON public.file_drop_zones USING btree (organization_id);


--
-- Name: idx_file_drop_zones_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_drop_zones_token ON public.file_drop_zones USING btree (public_token);


--
-- Name: idx_groups_system; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_groups_system ON public.access_groups USING btree (organization_id, is_system) WHERE (is_system = true);


--
-- Name: idx_groups_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_groups_type ON public.access_groups USING btree (group_type);


--
-- Name: idx_gw_credentials_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_credentials_org_id ON public.gw_credentials USING btree (organization_id);


--
-- Name: idx_gw_groups_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_groups_email ON public.gw_groups USING btree (organization_id, email);


--
-- Name: idx_gw_groups_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_groups_org_id ON public.gw_groups USING btree (organization_id);


--
-- Name: idx_gw_org_units_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_org_units_org_id ON public.gw_org_units USING btree (organization_id);


--
-- Name: idx_gw_org_units_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_org_units_parent ON public.gw_org_units USING btree (organization_id, parent_id);


--
-- Name: idx_gw_org_units_path; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_org_units_path ON public.gw_org_units USING btree (organization_id, path);


--
-- Name: idx_gw_synced_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_synced_users_department ON public.gw_synced_users USING btree (organization_id, department);


--
-- Name: idx_gw_synced_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_synced_users_email ON public.gw_synced_users USING btree (organization_id, email);


--
-- Name: idx_gw_synced_users_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_synced_users_org_id ON public.gw_synced_users USING btree (organization_id);


--
-- Name: idx_gw_synced_users_org_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_synced_users_org_unit ON public.gw_synced_users USING btree (organization_id, org_unit_path);


--
-- Name: idx_gw_synced_users_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gw_synced_users_status ON public.gw_synced_users USING btree (organization_id, is_suspended);


--
-- Name: idx_icon_library_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_icon_library_active ON public.icon_library USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_icon_library_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_icon_library_category ON public.icon_library USING btree (icon_category);


--
-- Name: idx_icon_library_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_icon_library_key ON public.icon_library USING btree (icon_key);


--
-- Name: idx_icon_library_style; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_icon_library_style ON public.icon_library USING btree (icon_style);


--
-- Name: idx_module_entity_providers_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_module_entity_providers_entity ON public.module_entity_providers USING btree (entity_canonical_name);


--
-- Name: idx_module_entity_providers_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_module_entity_providers_module ON public.module_entity_providers USING btree (module_key);


--
-- Name: idx_notes_author; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notes_author ON public.helpdesk_notes USING btree (author_id);


--
-- Name: idx_notes_mentions; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notes_mentions ON public.helpdesk_notes USING gin (mentioned_users);


--
-- Name: idx_notes_ticket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notes_ticket ON public.helpdesk_notes USING btree (ticket_id);


--
-- Name: idx_org_modules_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_modules_org_id ON public.organization_modules USING btree (organization_id);


--
-- Name: idx_org_settings_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_settings_key ON public.organization_settings USING btree (organization_id, key);


--
-- Name: idx_org_settings_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_settings_org_id ON public.organization_settings USING btree (organization_id);


--
-- Name: idx_org_users_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_company ON public.organization_users USING btree (company) WHERE (company IS NOT NULL);


--
-- Name: idx_org_users_custom_fields; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_custom_fields ON public.organization_users USING gin (custom_fields);


--
-- Name: idx_org_users_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_deleted ON public.organization_users USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_org_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_department ON public.organization_users USING btree (department);


--
-- Name: idx_org_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_email ON public.organization_users USING btree (email);


--
-- Name: idx_org_users_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_employee_id ON public.organization_users USING btree (employee_id);


--
-- Name: idx_org_users_google_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_google_id ON public.organization_users USING btree (google_workspace_id) WHERE (google_workspace_id IS NOT NULL);


--
-- Name: idx_org_users_google_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_google_workspace_id ON public.organization_users USING btree (google_workspace_id);


--
-- Name: idx_org_users_guest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_guest ON public.organization_users USING btree (is_guest) WHERE (is_guest = true);


--
-- Name: idx_org_users_guest_expired; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_guest_expired ON public.organization_users USING btree (guest_expires_at) WHERE ((is_guest = true) AND (guest_expires_at IS NOT NULL));


--
-- Name: idx_org_users_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_location ON public.organization_users USING btree (location);


--
-- Name: idx_org_users_microsoft_365_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_microsoft_365_id ON public.organization_users USING btree (microsoft_365_id);


--
-- Name: idx_org_users_microsoft_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_microsoft_id ON public.organization_users USING btree (microsoft_365_id) WHERE (microsoft_365_id IS NOT NULL);


--
-- Name: idx_org_users_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_org_id ON public.organization_users USING btree (organization_id);


--
-- Name: idx_org_users_reporting_manager; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_reporting_manager ON public.organization_users USING btree (reporting_manager_id);


--
-- Name: idx_org_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_role ON public.organization_users USING btree (role);


--
-- Name: idx_org_users_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_status ON public.organization_users USING btree (user_status) WHERE (deleted_at IS NULL);


--
-- Name: idx_org_users_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_type ON public.organization_users USING btree (user_type);


--
-- Name: idx_org_users_type_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_org_users_type_user_status ON public.organization_users USING btree (user_type, user_status);


--
-- Name: idx_organization_modules_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organization_modules_enabled ON public.organization_modules USING btree (organization_id, is_enabled);


--
-- Name: idx_orgs_logo_asset; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orgs_logo_asset ON public.organizations USING btree (company_logo_asset_id);


--
-- Name: idx_password_setup_tokens_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_setup_tokens_expires_at ON public.password_setup_tokens USING btree (expires_at);


--
-- Name: idx_password_setup_tokens_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_setup_tokens_token ON public.password_setup_tokens USING btree (token);


--
-- Name: idx_password_setup_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_setup_tokens_user_id ON public.password_setup_tokens USING btree (user_id);


--
-- Name: idx_photo_sizes_asset; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_photo_sizes_asset ON public.photo_sizes USING btree (original_asset_id);


--
-- Name: idx_photo_sizes_size_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_photo_sizes_size_key ON public.photo_sizes USING btree (size_key);


--
-- Name: idx_platform_integrations_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_integrations_active ON public.platform_integrations USING btree (is_active);


--
-- Name: idx_platform_integrations_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_integrations_org ON public.platform_integrations USING btree (organization_id);


--
-- Name: idx_presence_last_ping; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presence_last_ping ON public.helpdesk_presence USING btree (last_ping);


--
-- Name: idx_presence_ticket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presence_ticket ON public.helpdesk_presence USING btree (ticket_id);


--
-- Name: idx_presence_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presence_user ON public.helpdesk_presence USING btree (user_id);


--
-- Name: idx_public_assets_cdn_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_public_assets_cdn_url ON public.public_assets USING btree (cdn_url);


--
-- Name: idx_public_assets_org_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_public_assets_org_module ON public.public_assets USING btree (organization_id, module_source);


--
-- Name: idx_public_assets_org_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_public_assets_org_type ON public.public_assets USING btree (organization_id, asset_type);


--
-- Name: idx_public_assets_public_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_public_assets_public_url ON public.public_assets USING btree (public_url);


--
-- Name: idx_security_events_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_created ON public.security_events USING btree (created_at DESC);


--
-- Name: idx_security_events_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_org ON public.security_events USING btree (organization_id);


--
-- Name: idx_security_events_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_severity ON public.security_events USING btree (severity, acknowledged) WHERE (acknowledged = false);


--
-- Name: idx_security_events_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_type ON public.security_events USING btree (event_type);


--
-- Name: idx_security_events_unacknowledged; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_unacknowledged ON public.security_events USING btree (organization_id, acknowledged, severity) WHERE (acknowledged = false);


--
-- Name: idx_security_events_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_security_events_user ON public.security_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_signature_assignments_assignment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signature_assignments_assignment ON public.signature_assignments USING btree (organization_id, assignment_type, assignment_value);


--
-- Name: idx_signature_assignments_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signature_assignments_template ON public.signature_assignments USING btree (template_id);


--
-- Name: idx_signature_campaigns_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signature_campaigns_dates ON public.signature_campaigns USING btree (start_date, end_date);


--
-- Name: idx_signature_campaigns_org_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signature_campaigns_org_status ON public.signature_campaigns USING btree (organization_id, status);


--
-- Name: idx_signature_templates_template_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signature_templates_template_type ON public.signature_templates USING btree (template_type);


--
-- Name: idx_template_assignments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_active ON public.template_assignments USING btree (is_active, priority);


--
-- Name: idx_template_assignments_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_department ON public.template_assignments USING btree (target_department_id) WHERE (target_department_id IS NOT NULL);


--
-- Name: idx_template_assignments_group_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_group_email ON public.template_assignments USING btree (target_group_email) WHERE (target_group_email IS NOT NULL);


--
-- Name: idx_template_assignments_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_org ON public.template_assignments USING btree (organization_id);


--
-- Name: idx_template_assignments_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_template ON public.template_assignments USING btree (template_id);


--
-- Name: idx_template_assignments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_assignments_user ON public.template_assignments USING btree (target_user_id) WHERE (target_user_id IS NOT NULL);


--
-- Name: idx_template_campaigns_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_campaigns_active ON public.template_campaigns USING btree (organization_id, status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_template_campaigns_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_campaigns_dates ON public.template_campaigns USING btree (start_date, end_date);


--
-- Name: idx_template_campaigns_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_campaigns_org ON public.template_campaigns USING btree (organization_id);


--
-- Name: idx_template_campaigns_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_campaigns_status ON public.template_campaigns USING btree (status);


--
-- Name: idx_template_campaigns_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_campaigns_template ON public.template_campaigns USING btree (template_id);


--
-- Name: idx_template_types_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_types_category ON public.template_types USING btree (category);


--
-- Name: idx_template_types_module_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_template_types_module_key ON public.template_types USING btree (module_key);


--
-- Name: idx_templates_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_org ON public.helpdesk_templates USING btree (organization_id) WHERE (is_active = true);


--
-- Name: idx_templates_shortcut; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_shortcut ON public.helpdesk_templates USING btree (shortcuts) WHERE (shortcuts IS NOT NULL);


--
-- Name: idx_tickets_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_assigned ON public.helpdesk_tickets USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_tickets_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_created ON public.helpdesk_tickets USING btree (created_at DESC);


--
-- Name: idx_tickets_google_msg; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_google_msg ON public.helpdesk_tickets USING btree (google_message_id);


--
-- Name: idx_tickets_google_thread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_google_thread ON public.helpdesk_tickets USING btree (google_thread_id);


--
-- Name: idx_tickets_org_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_org_status ON public.helpdesk_tickets USING btree (organization_id, status);


--
-- Name: idx_tickets_sla; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_sla ON public.helpdesk_tickets USING btree (sla_deadline) WHERE ((status)::text <> ALL ((ARRAY['resolved'::character varying, 'closed'::character varying])::text[]));


--
-- Name: idx_tracking_events_campaign_type_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracking_events_campaign_type_time ON public.tracking_events USING btree (campaign_id, event_type, occurred_at);


--
-- Name: idx_tracking_events_result_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracking_events_result_time ON public.tracking_events USING btree (result_id, occurred_at);


--
-- Name: idx_tracking_events_user_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracking_events_user_time ON public.tracking_events USING btree (user_id, occurred_at);


--
-- Name: idx_tracking_results_campaign_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracking_results_campaign_status ON public.tracking_results USING btree (campaign_id, status);


--
-- Name: idx_tracking_results_rid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tracking_results_rid ON public.tracking_results USING btree (rid);


--
-- Name: idx_user_addresses_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_addresses_user_id ON public.user_addresses USING btree (user_id);


--
-- Name: idx_user_assets_asset_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_assets_asset_id ON public.user_assets USING btree (asset_id);


--
-- Name: idx_user_assets_is_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_assets_is_primary ON public.user_assets USING btree (is_primary);


--
-- Name: idx_user_assets_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_assets_user_id ON public.user_assets USING btree (user_id);


--
-- Name: idx_user_group_memberships_group_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_group_memberships_group_id ON public.user_group_memberships USING btree (group_id);


--
-- Name: idx_user_group_memberships_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_group_memberships_user_id ON public.user_group_memberships USING btree (user_id);


--
-- Name: idx_user_groups_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_groups_email ON public.user_groups USING btree (email);


--
-- Name: idx_user_groups_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_groups_org_id ON public.user_groups USING btree (organization_id);


--
-- Name: idx_user_platform_ids_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_platform_ids_platform ON public.user_platform_ids USING btree (platform_integration_id);


--
-- Name: idx_user_platform_ids_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_platform_ids_user ON public.user_platform_ids USING btree (user_id);


--
-- Name: idx_user_secondary_emails_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_secondary_emails_email ON public.user_secondary_emails USING btree (email);


--
-- Name: idx_user_secondary_emails_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_secondary_emails_user_id ON public.user_secondary_emails USING btree (user_id);


--
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_avatar_asset; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_avatar_asset ON public.organization_users USING btree (avatar_asset_id);


--
-- Name: idx_users_blocked; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_blocked ON public.organization_users USING btree (organization_id, blocked_at) WHERE (blocked_at IS NOT NULL);


--
-- Name: idx_users_blocked_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_blocked_status ON public.organization_users USING btree (user_status) WHERE ((user_status)::text = 'blocked'::text);


--
-- Name: idx_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_department ON public.organization_users USING btree (department_id);


--
-- Name: idx_users_designations; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_designations ON public.organization_users USING gin (to_tsvector('english'::regconfig, professional_designations));


--
-- Name: idx_workspace_members_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_members_user ON public.workspace_members USING btree (user_id);


--
-- Name: idx_workspace_members_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_members_workspace ON public.workspace_members USING btree (workspace_id);


--
-- Name: idx_workspaces_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspaces_active ON public.workspaces USING btree (organization_id, is_active) WHERE (is_active = true);


--
-- Name: idx_workspaces_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspaces_org ON public.workspaces USING btree (organization_id);


--
-- Name: idx_workspaces_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspaces_platform ON public.workspaces USING btree (platform, external_id);


--
-- Name: departments departments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_departments_updated_at();


--
-- Name: platform_integrations platform_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER platform_integrations_updated_at BEFORE UPDATE ON public.platform_integrations FOR EACH ROW EXECUTE FUNCTION public.update_platform_integrations_updated_at();


--
-- Name: organizations trigger_seed_labels_on_org_creation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_seed_labels_on_org_creation AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.initialize_organization_labels();


--
-- Name: organization_users trigger_sync_is_guest; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_sync_is_guest BEFORE INSERT OR UPDATE OF user_type ON public.organization_users FOR EACH ROW EXECUTE FUNCTION public.sync_is_guest();


--
-- Name: gw_credentials update_gw_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_gw_credentials_updated_at BEFORE UPDATE ON public.gw_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: gw_groups update_gw_groups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_gw_groups_updated_at BEFORE UPDATE ON public.gw_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: gw_org_units update_gw_org_units_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_gw_org_units_updated_at BEFORE UPDATE ON public.gw_org_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: gw_synced_users update_gw_synced_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_gw_synced_users_updated_at BEFORE UPDATE ON public.gw_synced_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: helpdesk_sla_rules update_helpdesk_sla_rules_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_helpdesk_sla_rules_timestamp BEFORE UPDATE ON public.helpdesk_sla_rules FOR EACH ROW EXECUTE FUNCTION public.update_ticket_timestamp();


--
-- Name: helpdesk_templates update_helpdesk_templates_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_helpdesk_templates_timestamp BEFORE UPDATE ON public.helpdesk_templates FOR EACH ROW EXECUTE FUNCTION public.update_ticket_timestamp();


--
-- Name: helpdesk_tickets update_helpdesk_tickets_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_helpdesk_tickets_timestamp BEFORE UPDATE ON public.helpdesk_tickets FOR EACH ROW EXECUTE FUNCTION public.update_ticket_timestamp();


--
-- Name: modules update_modules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: organization_modules update_organization_modules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_organization_modules_updated_at BEFORE UPDATE ON public.organization_modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: organization_settings update_organization_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_organization_settings_updated_at BEFORE UPDATE ON public.organization_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: organization_users update_organization_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_organization_users_updated_at BEFORE UPDATE ON public.organization_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: template_assignments update_template_assignments_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_template_assignments_timestamp BEFORE UPDATE ON public.template_assignments FOR EACH ROW EXECUTE FUNCTION public.update_template_assignments_updated_at();


--
-- Name: template_campaigns update_template_campaigns_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_template_campaigns_timestamp BEFORE UPDATE ON public.template_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_template_campaigns_updated_at();


--
-- Name: template_types update_template_types_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_template_types_timestamp BEFORE UPDATE ON public.template_types FOR EACH ROW EXECUTE FUNCTION public.update_template_types_updated_at();


--
-- Name: user_platform_ids user_platform_ids_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER user_platform_ids_updated_at BEFORE UPDATE ON public.user_platform_ids FOR EACH ROW EXECUTE FUNCTION public.update_platform_integrations_updated_at();


--
-- Name: access_group_members access_group_members_access_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_access_group_id_fkey FOREIGN KEY (access_group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


--
-- Name: access_group_members access_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: access_groups access_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: access_groups access_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: activity_logs activity_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: api_key_usage_logs api_key_usage_logs_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_key_usage_logs
    ADD CONSTRAINT api_key_usage_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: api_keys api_keys_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: asset_access_logs asset_access_logs_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_access_logs
    ADD CONSTRAINT asset_access_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.public_assets(id) ON DELETE CASCADE;


--
-- Name: asset_access_logs asset_access_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_access_logs
    ADD CONSTRAINT asset_access_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: asset_usage asset_usage_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_usage
    ADD CONSTRAINT asset_usage_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.public_assets(id) ON DELETE CASCADE;


--
-- Name: asset_usage asset_usage_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_usage
    ADD CONSTRAINT asset_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: assets assets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id);


--
-- Name: bulk_operation_audit bulk_operation_audit_bulk_operation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_audit
    ADD CONSTRAINT bulk_operation_audit_bulk_operation_id_fkey FOREIGN KEY (bulk_operation_id) REFERENCES public.bulk_operations(id) ON DELETE CASCADE;


--
-- Name: bulk_operation_audit bulk_operation_audit_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_audit
    ADD CONSTRAINT bulk_operation_audit_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: bulk_operation_templates bulk_operation_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_templates
    ADD CONSTRAINT bulk_operation_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: bulk_operation_templates bulk_operation_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operation_templates
    ADD CONSTRAINT bulk_operation_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bulk_operations bulk_operations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: bulk_operations bulk_operations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaign_analytics campaign_analytics_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_analytics campaign_analytics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_analytics
    ADD CONSTRAINT campaign_analytics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: custom_labels custom_labels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: custom_labels custom_labels_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: custom_labels custom_labels_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_labels
    ADD CONSTRAINT custom_labels_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: departments departments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: departments departments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: departments departments_parent_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id);


--
-- Name: email_templates email_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: file_drop_activity file_drop_activity_drop_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_activity
    ADD CONSTRAINT file_drop_activity_drop_zone_id_fkey FOREIGN KEY (drop_zone_id) REFERENCES public.file_drop_zones(id) ON DELETE CASCADE;


--
-- Name: file_drop_activity file_drop_activity_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_activity
    ADD CONSTRAINT file_drop_activity_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: file_drop_activity file_drop_activity_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_activity
    ADD CONSTRAINT file_drop_activity_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.file_drop_uploads(id) ON DELETE CASCADE;


--
-- Name: file_drop_uploads file_drop_uploads_downloaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_uploads
    ADD CONSTRAINT file_drop_uploads_downloaded_by_fkey FOREIGN KEY (downloaded_by) REFERENCES public.organization_users(id);


--
-- Name: file_drop_uploads file_drop_uploads_drop_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_uploads
    ADD CONSTRAINT file_drop_uploads_drop_zone_id_fkey FOREIGN KEY (drop_zone_id) REFERENCES public.file_drop_zones(id) ON DELETE CASCADE;


--
-- Name: file_drop_uploads file_drop_uploads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_uploads
    ADD CONSTRAINT file_drop_uploads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: file_drop_zones file_drop_zones_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_zones
    ADD CONSTRAINT file_drop_zones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: file_drop_zones file_drop_zones_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_drop_zones
    ADD CONSTRAINT file_drop_zones_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gw_credentials gw_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_credentials
    ADD CONSTRAINT gw_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gw_groups gw_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_groups
    ADD CONSTRAINT gw_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gw_org_units gw_org_units_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_org_units
    ADD CONSTRAINT gw_org_units_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gw_synced_users gw_synced_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gw_synced_users
    ADD CONSTRAINT gw_synced_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: helpdesk_analytics_daily helpdesk_analytics_daily_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_analytics_daily
    ADD CONSTRAINT helpdesk_analytics_daily_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_analytics_daily helpdesk_analytics_daily_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_analytics_daily
    ADD CONSTRAINT helpdesk_analytics_daily_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: helpdesk_assignment_history helpdesk_assignment_history_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_assignment_history
    ADD CONSTRAINT helpdesk_assignment_history_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_assignment_history helpdesk_assignment_history_assigned_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_assignment_history
    ADD CONSTRAINT helpdesk_assignment_history_assigned_from_fkey FOREIGN KEY (assigned_from) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_assignment_history helpdesk_assignment_history_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_assignment_history
    ADD CONSTRAINT helpdesk_assignment_history_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_assignment_history helpdesk_assignment_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_assignment_history
    ADD CONSTRAINT helpdesk_assignment_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE;


--
-- Name: helpdesk_notes helpdesk_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_notes
    ADD CONSTRAINT helpdesk_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_notes helpdesk_notes_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_notes
    ADD CONSTRAINT helpdesk_notes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE;


--
-- Name: helpdesk_presence helpdesk_presence_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_presence
    ADD CONSTRAINT helpdesk_presence_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE;


--
-- Name: helpdesk_presence helpdesk_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_presence
    ADD CONSTRAINT helpdesk_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: helpdesk_sla_rules helpdesk_sla_rules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_sla_rules
    ADD CONSTRAINT helpdesk_sla_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: helpdesk_templates helpdesk_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_templates
    ADD CONSTRAINT helpdesk_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_templates helpdesk_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_templates
    ADD CONSTRAINT helpdesk_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: helpdesk_tickets helpdesk_tickets_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_tickets helpdesk_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: helpdesk_tickets helpdesk_tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: helpdesk_tickets helpdesk_tickets_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: organization_modules organization_modules_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.available_modules(id) ON DELETE CASCADE;


--
-- Name: organization_modules organization_modules_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_settings organization_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: organization_users organization_users_avatar_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_avatar_asset_id_fkey FOREIGN KEY (avatar_asset_id) REFERENCES public.public_assets(id) ON DELETE SET NULL;


--
-- Name: organization_users organization_users_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: organization_users organization_users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: organization_users organization_users_guest_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_guest_invited_by_fkey FOREIGN KEY (guest_invited_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_reporting_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_reporting_manager_id_fkey FOREIGN KEY (reporting_manager_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_company_logo_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_company_logo_asset_id_fkey FOREIGN KEY (company_logo_asset_id) REFERENCES public.public_assets(id) ON DELETE SET NULL;


--
-- Name: password_setup_tokens password_setup_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id);


--
-- Name: password_setup_tokens password_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: photo_sizes photo_sizes_original_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.photo_sizes
    ADD CONSTRAINT photo_sizes_original_asset_id_fkey FOREIGN KEY (original_asset_id) REFERENCES public.public_assets(id) ON DELETE CASCADE;


--
-- Name: platform_integrations platform_integrations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: platform_integrations platform_integrations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: public_assets public_assets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_assets
    ADD CONSTRAINT public_assets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: public_assets public_assets_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.public_assets
    ADD CONSTRAINT public_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.organization_users(id);


--
-- Name: security_events security_events_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: security_events security_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: signature_assignments signature_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: signature_assignments signature_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_assignments
    ADD CONSTRAINT signature_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE CASCADE;


--
-- Name: signature_campaigns signature_campaigns_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.organization_users(id);


--
-- Name: signature_campaigns signature_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id);


--
-- Name: signature_campaigns signature_campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: signature_campaigns signature_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_campaigns
    ADD CONSTRAINT signature_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE RESTRICT;


--
-- Name: signature_templates signature_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id);


--
-- Name: signature_templates signature_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: signature_templates signature_templates_template_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_template_type_fkey FOREIGN KEY (template_type) REFERENCES public.template_types(type_key) ON DELETE SET NULL;


--
-- Name: signature_templates signature_templates_thumbnail_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signature_templates
    ADD CONSTRAINT signature_templates_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES public.public_assets(id);


--
-- Name: smtp_settings smtp_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: template_assignments template_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: template_assignments template_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: template_assignments template_assignments_target_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_target_department_id_fkey FOREIGN KEY (target_department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: template_assignments template_assignments_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: template_assignments template_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE CASCADE;


--
-- Name: template_assignments template_assignments_template_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_assignments
    ADD CONSTRAINT template_assignments_template_type_fkey FOREIGN KEY (template_type) REFERENCES public.template_types(type_key) ON DELETE CASCADE;


--
-- Name: template_campaign_targets template_campaign_targets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaign_targets
    ADD CONSTRAINT template_campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.template_campaigns(id) ON DELETE CASCADE;


--
-- Name: template_campaigns template_campaigns_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: template_campaigns template_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: template_campaigns template_campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: template_campaigns template_campaigns_previous_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_previous_template_id_fkey FOREIGN KEY (previous_template_id) REFERENCES public.signature_templates(id) ON DELETE SET NULL;


--
-- Name: template_campaigns template_campaigns_target_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_target_department_id_fkey FOREIGN KEY (target_department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: template_campaigns template_campaigns_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: template_campaigns template_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE CASCADE;


--
-- Name: template_campaigns template_campaigns_template_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_campaigns
    ADD CONSTRAINT template_campaigns_template_type_fkey FOREIGN KEY (template_type) REFERENCES public.template_types(type_key) ON DELETE CASCADE;


--
-- Name: template_deployment_history template_deployment_history_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.template_assignments(id) ON DELETE SET NULL;


--
-- Name: template_deployment_history template_deployment_history_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.template_campaigns(id) ON DELETE SET NULL;


--
-- Name: template_deployment_history template_deployment_history_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: template_deployment_history template_deployment_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: template_deployment_history template_deployment_history_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.signature_templates(id) ON DELETE CASCADE;


--
-- Name: template_deployment_history template_deployment_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_deployment_history
    ADD CONSTRAINT template_deployment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: tracking_events tracking_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE CASCADE;


--
-- Name: tracking_events tracking_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tracking_events tracking_events_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.tracking_results(id) ON DELETE CASCADE;


--
-- Name: tracking_events tracking_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id);


--
-- Name: tracking_results tracking_results_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.signature_campaigns(id) ON DELETE CASCADE;


--
-- Name: tracking_results tracking_results_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tracking_results tracking_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tracking_results
    ADD CONSTRAINT tracking_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_assets user_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: user_assets user_assets_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.organization_users(id);


--
-- Name: user_assets user_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_group_memberships user_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: user_group_memberships user_group_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_group_memberships
    ADD CONSTRAINT user_group_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_platform_ids user_platform_ids_platform_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platform_ids
    ADD CONSTRAINT user_platform_ids_platform_integration_id_fkey FOREIGN KEY (platform_integration_id) REFERENCES public.platform_integrations(id) ON DELETE CASCADE;


--
-- Name: user_platform_ids user_platform_ids_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platform_ids
    ADD CONSTRAINT user_platform_ids_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_secondary_emails user_secondary_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_secondary_emails
    ADD CONSTRAINT user_secondary_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: user_signatures user_signatures_current_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_current_template_id_fkey FOREIGN KEY (current_template_id) REFERENCES public.signature_templates(id);


--
-- Name: user_signatures user_signatures_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_signatures user_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signatures
    ADD CONSTRAINT user_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.organization_users(id) ON DELETE SET NULL;


--
-- Name: workspaces workspaces_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict TJ1Japex3FukpdfnYg2WLMvA3kLqSnLusVHhPHD1WmuIj4tbYe9AbcEAl0jhAaR

