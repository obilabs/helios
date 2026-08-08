import { logger } from '../utils/logger.js';

interface DataTransferConfig {
  enabled: boolean;
  transferTo: string;
  items: string[];  // ['drive', 'calendar', 'sites', 'groups']
}

const APPLICATION_IDS: Record<string, string> = {
  drive: '435070579839',
  calendar: '55656082996',
  sites: '529327477839',
  groups: '588034504559'
};

export async function initiateDataTransfer(
  user: any,
  config: DataTransferConfig,
  authToken: string
): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try {
    const applicationDataTransfers = config.items.map(item => ({
      applicationId: APPLICATION_IDS[item],
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
