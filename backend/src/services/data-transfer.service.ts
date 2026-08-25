import { logger } from '../utils/logger.js';
import {
  DATA_TRANSFER_APPLICATION_IDS,
  type DataTransferApplication,
} from '../config/google-application-ids.js';

interface DataTransferConfig {
  enabled: boolean;
  transferTo: string;
  items: string[];  // ['drive', 'calendar', 'sites', 'groups']
}

// FIX: this file previously kept its OWN application-ID map with `drive` and
// `calendar` SWAPPED (drive was '435070579839', calendar '55656082996'), so a
// Drive transfer silently moved Calendar data and vice-versa. Import the shared
// single source of truth instead — see config/google-application-ids.ts.

export async function initiateDataTransfer(
  user: any,
  config: DataTransferConfig,
  authToken: string
): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try {
    const applicationDataTransfers = config.items.map(item => ({
      applicationId: DATA_TRANSFER_APPLICATION_IDS[item as DataTransferApplication],
      applicationTransferParams: [] as any[]
    }));

    const transferResponse = await fetch('http://localhost:3001/api/google/admin/datatransfer/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        oldOwnerUserId: user.email,
        newOwnerUserId: config.transferTo,
        applicationDataTransfers
      })
    });

    if (!transferResponse.ok) {
      const error: any = await transferResponse.json();
      return { success: false, error: error.message || 'Data transfer failed' };
    }

    const transferData: any = await transferResponse.json();

    logger.info('Data transfer initiated', {
      from: user.email,
      to: config.transferTo,
      items: config.items,
      transferId: transferData.id
    });

    return { success: true, transferId: transferData.id };

  } catch (error: any) {
    logger.error('Failed to initiate data transfer', {
      userEmail: user.email,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}
