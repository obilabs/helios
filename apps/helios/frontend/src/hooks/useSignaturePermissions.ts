/**
 * useSignaturePermissions Hook
 *
 * Hook to fetch and check the current user's signature permissions.
 */

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../config/api';

export type PermissionLevel = 'admin' | 'designer' | 'campaign_manager' | 'helpdesk' | 'viewer';

interface SignaturePermissionState {
  effectivePermission: PermissionLevel;
  explicitPermission: PermissionLevel | null;
  isOrgAdmin: boolean;
  capabilities: string[];
  loading: boolean;
  error: string | null;
}

interface PermissionCheck {
  // Level checks
  isAdmin: boolean;
  isDesigner: boolean;
  isCampaignManager: boolean;
  isHelpdesk: boolean;
  isViewer: boolean;
  // Capability checks
  canViewTemplates: boolean;
  canCreateTemplates: boolean;
  canEditTemplates: boolean;
  canDeleteTemplates: boolean;
  canViewAssignments: boolean;
  canCreateAssignments: boolean;
  canEditAssignments: boolean;
  canDeleteAssignments: boolean;
  canViewCampaigns: boolean;
  canCreateCampaigns: boolean;
  canEditCampaigns: boolean;
  canDeleteCampaigns: boolean;
  canLaunchCampaigns: boolean;
  canViewAnalytics: boolean;
  canExportAnalytics: boolean;
  canViewPermissions: boolean;
  canManagePermissions: boolean;
  canViewSync: boolean;
  canExecuteSync: boolean;
}

export interface UseSignaturePermissionsResult extends SignaturePermissionState, PermissionCheck {
  hasCapability: (capability: string) => boolean;
  refresh: () => void;
}

export function useSignaturePermissions(): UseSignaturePermissionsResult {
  const [state, setState] = useState<SignaturePermissionState>({
    effectivePermission: 'viewer',
    explicitPermission: null,
    isOrgAdmin: false,
    capabilities: [],
    loading: true,
    error: null,
  });

  const fetchPermissions = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await authFetch('/api/signatures/permissions/me');

      if (!res.ok) {
        throw new Error('Failed to fetch permissions');
      }

      const data = await res.json();
      if (data.success) {
        setState({
          effectivePermission: data.data.effectivePermission,
          explicitPermission: data.data.explicitPermission,
          isOrgAdmin: data.data.isOrgAdmin,
          capabilities: data.data.capabilities || [],
          loading: false,
          error: null,
        });
      } else {
        throw new Error(data.error || 'Failed to fetch permissions');
      }
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Check if user has a specific capability
  const hasCapability = useCallback(
    (capability: string): boolean => {
      return state.capabilities.includes(capability);
    },
    [state.capabilities]
  );

  // Level checks
  const isAdmin = state.effectivePermission === 'admin';
  const isDesigner = state.effectivePermission === 'designer';
  const isCampaignManager = state.effectivePermission === 'campaign_manager';
  const isHelpdesk = state.effectivePermission === 'helpdesk';
  const isViewer = state.effectivePermission === 'viewer';

  // Capability checks
  const canViewTemplates = hasCapability('templates.view');
  const canCreateTemplates = hasCapability('templates.create');
  const canEditTemplates = hasCapability('templates.edit');
  const canDeleteTemplates = hasCapability('templates.delete');
  const canViewAssignments = hasCapability('assignments.view');
  const canCreateAssignments = hasCapability('assignments.create');
  const canEditAssignments = hasCapability('assignments.edit');
  const canDeleteAssignments = hasCapability('assignments.delete');
  const canViewCampaigns = hasCapability('campaigns.view');
  const canCreateCampaigns = hasCapability('campaigns.create');
  const canEditCampaigns = hasCapability('campaigns.edit');
  const canDeleteCampaigns = hasCapability('campaigns.delete');
  const canLaunchCampaigns = hasCapability('campaigns.launch');
  const canViewAnalytics = hasCapability('analytics.view');
  const canExportAnalytics = hasCapability('analytics.export');
  const canViewPermissions = hasCapability('permissions.view');
  const canManagePermissions = hasCapability('permissions.manage');
  const canViewSync = hasCapability('sync.view');
  const canExecuteSync = hasCapability('sync.execute');

  return {
    ...state,
    isAdmin,
    isDesigner,
    isCampaignManager,
    isHelpdesk,
    isViewer,
    canViewTemplates,
    canCreateTemplates,
    canEditTemplates,
    canDeleteTemplates,
    canViewAssignments,
    canCreateAssignments,
    canEditAssignments,
    canDeleteAssignments,
    canViewCampaigns,
    canCreateCampaigns,
    canEditCampaigns,
    canDeleteCampaigns,
    canLaunchCampaigns,
    canViewAnalytics,
    canExportAnalytics,
    canViewPermissions,
    canManagePermissions,
    canViewSync,
    canExecuteSync,
    hasCapability,
    refresh: fetchPermissions,
  };
}

export default useSignaturePermissions;
