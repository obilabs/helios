-- Migration 009: Add pre-built professional templates
-- Adds is_system_template field and inserts 5 professional signature templates

-- Add is_system_template field to distinguish pre-built templates
ALTER TABLE signature_templates
ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN signature_templates.is_system_template IS 'True for pre-built templates provided by the system';

-- Update the UNIQUE constraint to include template_type
-- First drop the old constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signature_templates_organization_id_name_key'
  ) THEN
    ALTER TABLE signature_templates
    DROP CONSTRAINT signature_templates_organization_id_name_key;
  END IF;
END $$;

-- Add new unique constraint that includes template_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signature_templates_org_name_type_key'
  ) THEN
    ALTER TABLE signature_templates
    ADD CONSTRAINT signature_templates_org_name_type_key
    UNIQUE(organization_id, name, template_type);
  END IF;
END $$;

-- Insert missing template types that frontend uses
INSERT INTO template_types (type_key, type_label, module_key, category, icon_name, supported_variables) VALUES
  (
    'email_signature',
    'Email Signature',
    'template-studio',
    'email_signatures',
    'EmailIcon',
    '["firstName", "lastName", "email", "jobTitle", "department", "mobilePhone", "workPhone", "userPhoto", "companyName", "companyLogo"]'::jsonb
  ),
  (
    'html_snippet',
    'HTML Snippet',
    'template-studio',
    'web_content',
    'CodeIcon',
    '["companyName", "companyLogo", "companyWebsite"]'::jsonb
  ),
  (
    'public_page',
    'Public Page',
    'public-assets',
    'web_content',
    'WebIcon',
    '["companyName", "companyLogo", "companyWebsite"]'::jsonb
  )
ON CONFLICT (type_key) DO NOTHING;

-- Insert pre-built professional templates
-- Using a DO block to get the organization_id dynamically
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Get the first organization (single-tenant system)
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  -- Only proceed if an organization exists
  IF v_org_id IS NOT NULL THEN

    -- Template 1: Professional Simple
    INSERT INTO signature_templates (
      organization_id, name, description, html_content, category,
      template_type, is_system_template, is_active, variables_used
    ) VALUES (
      v_org_id,
      'Professional Simple',
      'Clean and modern signature with photo, contact info, and social links',
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
  <tr>
    <td style="padding-right: 20px; vertical-align: top;">
      <img src="{{userPhoto}}" width="80" height="80" style="border-radius: 50%; display: block;" alt="{{firstName}} {{lastName}}">
    </td>
    <td style="vertical-align: top;">
      <div style="margin-bottom: 8px;">
        <strong style="font-size: 16px; color: #1a1a1a;">{{firstName}} {{lastName}}</strong><br>
        <span style="color: #666; font-size: 14px;">{{jobTitle}}</span><br>
        <span style="color: #999; font-size: 13px;">{{department}}</span>
      </div>
      <div style="margin-bottom: 8px; font-size: 13px;">
        📧 <a href="mailto:{{email}}" style="color: #1976d2; text-decoration: none;">{{email}}</a><br>
        📱 {{mobilePhone}}<br>
        🏢 {{workPhone}}
      </div>
      <div style="font-size: 13px;">
        <a href="{{userLinkedIn}}" style="color: #0077b5; text-decoration: none; margin-right: 10px;">LinkedIn</a>
        <a href="{{userTwitter}}" style="color: #1da1f2; text-decoration: none; margin-right: 10px;">Twitter</a>
        <a href="{{userGitHub}}" style="color: #333; text-decoration: none;">GitHub</a>
      </div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding-top: 15px; margin-top: 15px; border-top: 2px solid #1976d2;">
      <div style="padding-top: 10px; font-size: 12px; color: #666;">
        <strong>{{companyName}}</strong> | {{companyWebsite}}
      </div>
    </td>
  </tr>
</table>',
      'professional',
      'email_signature',
      true,
      true,
      '["firstName", "lastName", "jobTitle", "department", "email", "mobilePhone", "workPhone", "userPhoto", "userLinkedIn", "userTwitter", "userGitHub", "companyName", "companyWebsite"]'::jsonb
    )
    ON CONFLICT (organization_id, name, template_type) DO NOTHING;

    -- Template 2: Modern Minimal
    INSERT INTO signature_templates (
      organization_id, name, description, html_content, category,
      template_type, is_system_template, is_active, variables_used
    ) VALUES (
      v_org_id,
      'Modern Minimal',
      'Ultra-clean design with company branding and essential contact info',
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px;">
  <tr>
    <td style="padding-bottom: 12px;">
      <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">
        {{firstName}} {{lastName}}
      </div>
      <div style="font-size: 14px; color: #666; margin-bottom: 2px;">
        {{jobTitle}} • {{department}}
      </div>
      <div style="font-size: 13px; color: #999;">
        {{companyName}}
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding: 12px 0; border-top: 3px solid #1976d2; border-bottom: 1px solid #e0e0e0;">
      <div style="font-size: 13px; color: #666;">
        <span style="margin-right: 15px;">✉ <a href="mailto:{{email}}" style="color: #1976d2; text-decoration: none;">{{email}}</a></span>
        <span style="margin-right: 15px;">☎ {{mobilePhone}}</span>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 12px;">
      <div style="font-size: 12px; color: #999;">
        🌐 <a href="{{companyWebsite}}" style="color: #666; text-decoration: none;">{{companyWebsite}}</a> |
        <a href="{{companyLinkedIn}}" style="color: #0077b5; text-decoration: none;">LinkedIn</a>
      </div>
      <div style="font-size: 11px; color: #bbb; margin-top: 6px;">
        {{companyTagline}}
      </div>
    </td>
  </tr>
</table>',
      'modern',
      'email_signature',
      true,
      true,
      '["firstName", "lastName", "jobTitle", "department", "email", "mobilePhone", "companyName", "companyWebsite", "companyLinkedIn", "companyTagline"]'::jsonb
    )
    ON CONFLICT (organization_id, name, template_type) DO NOTHING;

    -- Template 3: Bold Executive
    INSERT INTO signature_templates (
      organization_id, name, description, html_content, category,
      template_type, is_system_template, is_active, variables_used
    ) VALUES (
      v_org_id,
      'Bold Executive',
      'Professional signature with full contact details and comprehensive social links',
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Georgia, serif; font-size: 14px; max-width: 600px;">
  <tr>
    <td colspan="2" style="padding-bottom: 15px; border-bottom: 3px solid #2c3e50;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="100" style="padding-right: 20px;">
            <img src="{{userPhoto}}" width="90" height="90" style="border-radius: 8px; border: 3px solid #1976d2;" alt="{{firstName}} {{lastName}}">
          </td>
          <td style="vertical-align: middle;">
            <div style="font-size: 20px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">
              {{firstName}} {{lastName}}
            </div>
            <div style="font-size: 15px; color: #1976d2; font-weight: 600; margin-bottom: 2px;">
              {{jobTitle}}
            </div>
            <div style="font-size: 13px; color: #7f8c8d;">
              {{department}} • {{organizationalUnit}}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding: 15px 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="50%" style="padding-right: 10px; font-size: 13px; color: #555;">
            <div style="margin-bottom: 6px;">
              <strong>Email:</strong> <a href="mailto:{{email}}" style="color: #1976d2; text-decoration: none;">{{email}}</a>
            </div>
            <div style="margin-bottom: 6px;">
              <strong>Mobile:</strong> {{mobilePhone}}
            </div>
            <div>
              <strong>Office:</strong> {{workPhone}} ext. {{workPhoneExtension}}
            </div>
          </td>
          <td width="50%" style="padding-left: 10px; font-size: 13px; color: #555;">
            <div style="margin-bottom: 6px;">
              <strong>Location:</strong> {{location}}
            </div>
            <div>
              <strong>Employee ID:</strong> {{employeeId}}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding: 12px 0; border-top: 1px solid #ecf0f1;">
      <div style="font-size: 12px; margin-bottom: 8px;">
        <strong>Connect:</strong>
        <a href="{{userLinkedIn}}" style="color: #0077b5; text-decoration: none; margin: 0 8px;">LinkedIn</a> |
        <a href="{{userTwitter}}" style="color: #1da1f2; text-decoration: none; margin: 0 8px;">Twitter</a> |
        <a href="{{userGitHub}}" style="color: #333; text-decoration: none; margin: 0 8px;">GitHub</a> |
        <a href="{{userPortfolio}}" style="color: #e74c3c; text-decoration: none; margin: 0 8px;">Portfolio</a>
      </div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding-top: 12px; border-top: 2px solid #1976d2;">
      <div style="font-size: 14px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">
        {{companyName}}
      </div>
      <div style="font-size: 12px; color: #7f8c8d; margin-bottom: 6px;">
        {{companyTagline}}
      </div>
      <div style="font-size: 11px; color: #95a5a6;">
        {{companyAddress}} | {{companyPhone}} | <a href="{{companyWebsite}}" style="color: #1976d2; text-decoration: none;">{{companyWebsite}}</a>
      </div>
    </td>
  </tr>
</table>',
      'executive',
      'email_signature',
      true,
      true,
      '["firstName", "lastName", "jobTitle", "department", "organizationalUnit", "email", "mobilePhone", "workPhone", "workPhoneExtension", "location", "employeeId", "userPhoto", "userLinkedIn", "userTwitter", "userGitHub", "userPortfolio", "companyName", "companyTagline", "companyAddress", "companyPhone", "companyWebsite"]'::jsonb
    )
    ON CONFLICT (organization_id, name, template_type) DO NOTHING;

    -- Template 4: Compact Professional
    INSERT INTO signature_templates (
      organization_id, name, description, html_content, category,
      template_type, is_system_template, is_active, variables_used
    ) VALUES (
      v_org_id,
      'Compact Professional',
      'Space-efficient signature without photo, perfect for reply chains',
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;">
  <tr>
    <td>
      <div style="margin-bottom: 4px;">
        <strong style="font-size: 15px; color: #1a1a1a;">{{firstName}} {{lastName}}</strong> |
        <span style="color: #666;">{{jobTitle}}</span>
      </div>
      <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
        {{companyName}} • {{department}}
      </div>
      <div style="font-size: 12px;">
        <a href="mailto:{{email}}" style="color: #1976d2; text-decoration: none;">{{email}}</a> •
        {{mobilePhone}} •
        <a href="{{companyWebsite}}" style="color: #1976d2; text-decoration: none;">{{companyWebsite}}</a>
      </div>
      <div style="font-size: 11px; color: #999; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e0e0e0;">
        <a href="{{userLinkedIn}}" style="color: #0077b5; text-decoration: none; margin-right: 8px;">in</a>
        <a href="{{companyLinkedIn}}" style="color: #666; text-decoration: none;">Company Page</a>
      </div>
    </td>
  </tr>
</table>',
      'compact',
      'email_signature',
      true,
      true,
      '["firstName", "lastName", "jobTitle", "department", "email", "mobilePhone", "companyName", "companyWebsite", "userLinkedIn", "companyLinkedIn"]'::jsonb
    )
    ON CONFLICT (organization_id, name, template_type) DO NOTHING;

    -- Template 5: Full Featured
    INSERT INTO signature_templates (
      organization_id, name, description, html_content, category,
      template_type, is_system_template, is_active, variables_used
    ) VALUES (
      v_org_id,
      'Full Featured Showcase',
      'Comprehensive signature showcasing all available fields including bio, pronouns, and company social',
      '<table cellpadding="0" cellspacing="0" border="0" style="font-family: ''Helvetica Neue'', Helvetica, Arial, sans-serif; font-size: 14px; max-width: 650px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
  <tr>
    <td colspan="2" style="padding-bottom: 15px; border-bottom: 2px solid #1976d2;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="100" style="padding-right: 20px;">
            <img src="{{userPhoto}}" width="100" height="100" style="border-radius: 50%; border: 4px solid #f0f0f0;" alt="{{firstName}} {{lastName}}">
          </td>
          <td style="vertical-align: top;">
            <div style="font-size: 22px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px;">
              {{firstName}} {{lastName}} <span style="font-size: 14px; font-weight: normal; color: #666;">({{pronouns}})</span>
            </div>
            <div style="font-size: 16px; color: #1976d2; font-weight: 600; margin-bottom: 4px;">
              {{jobTitle}} {{professionalDesignations}}
            </div>
            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
              {{department}} • {{organizationalUnit}} • {{location}}
            </div>
            <div style="font-size: 12px; color: #888; font-style: italic; line-height: 1.4;">
              {{bio}}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding: 15px 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-size: 13px; color: #555; padding-right: 20px;">
            <div style="margin-bottom: 6px;">
              📧 <a href="mailto:{{email}}" style="color: #1976d2; text-decoration: none;">{{email}}</a>
            </div>
            <div style="margin-bottom: 6px;">
              📱 {{mobilePhone}}
            </div>
            <div style="margin-bottom: 6px;">
              📞 {{workPhone}} ext. {{workPhoneExtension}}
            </div>
          </td>
          <td style="font-size: 13px; color: #555; vertical-align: top;">
            <div style="margin-bottom: 6px;">
              <strong>Personal:</strong>
            </div>
            <div style="font-size: 12px;">
              <a href="{{userLinkedIn}}" style="color: #0077b5; text-decoration: none; margin-right: 8px;">LinkedIn</a>
              <a href="{{userTwitter}}" style="color: #1da1f2; text-decoration: none; margin-right: 8px;">Twitter</a>
              <a href="{{userGitHub}}" style="color: #333; text-decoration: none; margin-right: 8px;">GitHub</a>
              <a href="{{userPortfolio}}" style="color: #e74c3c; text-decoration: none; margin-right: 8px;">Portfolio</a>
              <a href="{{userInstagram}}" style="color: #c32aa3; text-decoration: none; margin-right: 8px;">Instagram</a>
              <a href="{{userFacebook}}" style="color: #4267b2; text-decoration: none;">Facebook</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding-top: 15px; border-top: 2px solid #f0f0f0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="80" style="padding-right: 15px; vertical-align: top;">
            <img src="{{companyLogo}}" height="60" style="display: block;" alt="{{companyName}}">
          </td>
          <td style="vertical-align: top;">
            <div style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px;">
              {{companyName}}
            </div>
            <div style="font-size: 13px; color: #666; font-style: italic; margin-bottom: 6px;">
              {{companyTagline}}
            </div>
            <div style="font-size: 11px; color: #888; margin-bottom: 6px;">
              {{companyAddress}}<br>
              {{companyPhone}} • <a href="mailto:{{companyEmail}}" style="color: #1976d2; text-decoration: none;">{{companyEmail}}</a>
            </div>
            <div style="font-size: 11px; margin-top: 8px;">
              <a href="{{companyWebsite}}" style="color: #1976d2; text-decoration: none; margin-right: 6px;">Website</a> |
              <a href="{{companyBlog}}" style="color: #1976d2; text-decoration: none; margin: 0 6px;">Blog</a> |
              <a href="{{companyLinkedIn}}" style="color: #0077b5; text-decoration: none; margin: 0 6px;">LinkedIn</a> |
              <a href="{{companyTwitter}}" style="color: #1da1f2; text-decoration: none; margin: 0 6px;">Twitter</a> |
              <a href="{{companyFacebook}}" style="color: #4267b2; text-decoration: none; margin: 0 6px;">Facebook</a> |
              <a href="{{companyInstagram}}" style="color: #c32aa3; text-decoration: none; margin: 0 6px;">Instagram</a> |
              <a href="{{companyYouTube}}" style="color: #ff0000; text-decoration: none; margin: 0 6px;">YouTube</a> |
              <a href="{{companyTikTok}}" style="color: #000; text-decoration: none; margin: 0 6px;">TikTok</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
      'comprehensive',
      'email_signature',
      true,
      true,
      '["firstName", "lastName", "pronouns", "jobTitle", "professionalDesignations", "department", "organizationalUnit", "location", "bio", "email", "mobilePhone", "workPhone", "workPhoneExtension", "userPhoto", "userLinkedIn", "userTwitter", "userGitHub", "userPortfolio", "userInstagram", "userFacebook", "companyName", "companyLogo", "companyTagline", "companyAddress", "companyPhone", "companyEmail", "companyWebsite", "companyBlog", "companyLinkedIn", "companyTwitter", "companyFacebook", "companyInstagram", "companyYouTube", "companyTikTok"]'::jsonb
    )
    ON CONFLICT (organization_id, name, template_type) DO NOTHING;

    RAISE NOTICE 'Pre-built templates inserted successfully for organization: %', v_org_id;
  ELSE
    RAISE NOTICE 'No organization found - skipping template insertion';
  END IF;
END $$;

COMMENT ON TABLE signature_templates IS 'Email signature templates with support for multiple types and system templates';
