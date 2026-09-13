import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../config/api';

/**
 * Whether this organization has a Microsoft 365 tenant connected.
 *
 * Helios is Google-first: Microsoft vocabulary (create-in-M365 options, M365
 * sync panels, "Google/Microsoft" filters) is only shown once a tenant is
 * actually connected. One cached request shared by every caller; false while
 * loading or on error, so Google-only installs never flash Microsoft copy.
 */
export function useMicrosoftConnected(): boolean {
  const { data } = useQuery({
    queryKey: ['integrations', 'microsoft-status'],
    queryFn: async (): Promise<boolean> => {
      const response = await authFetch('/api/v1/microsoft/status');
      if (!response.ok) return false;
      const body = await response.json().catch(() => ({}));
      return body?.success === true && body?.data?.isConfigured === true;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data === true;
}
