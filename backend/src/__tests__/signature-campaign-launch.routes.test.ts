/**
 * Launching a signature campaign.
 *
 * A campaign that is live now must reach mailboxes: its users are queued for
 * the next signature sync. A campaign whose start date has not arrived is
 * scheduled instead, and nothing is queued until the scheduler activates it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

const ORG_ID = 'org-1';

const getCampaign = jest.fn<(...args: any[]) => Promise<any>>();
const launchCampaign = jest.fn<(...args: any[]) => Promise<any>>();
const getCampaignAffectedUsers = jest.fn<(...args: any[]) => Promise<any>>();
const markUsersPending = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-1', email: 'admin@corp.test', role: 'admin', organizationId: ORG_ID };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../services/signature-campaign.service.js', () => ({
  signatureCampaignService: { getCampaign, launchCampaign, getCampaignAffectedUsers },
}));
jest.unstable_mockModule('../services/signature-sync.service.js', () => ({
  signatureSyncService: { markUsersPending },
}));

const { default: router } = await import('../routes/signature-campaigns.routes.js');

let app: Express;
beforeEach(() => {
  getCampaign.mockReset();
  launchCampaign.mockReset();
  getCampaignAffectedUsers.mockReset();
  markUsersPending.mockReset();
  app = express();
  app.use(express.json());
  app.use('/campaigns', router);
  getCampaign.mockResolvedValue({ id: 'c1', organizationId: ORG_ID, status: 'scheduled' });
});

describe('POST /campaigns/:id/launch', () => {
  it('queues the campaign users for a signature sync when the campaign is live', async () => {
    launchCampaign.mockResolvedValue({ id: 'c1', organizationId: ORG_ID, status: 'active' });
    getCampaignAffectedUsers.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    const res = await request(app).post('/campaigns/c1/launch');

    expect(res.status).toBe(200);
    expect(markUsersPending).toHaveBeenCalledWith(['u1', 'u2']);
    expect(res.body.queuedUsers).toBe(2);
    expect(res.body.message).toMatch(/2 user signature\(s\) queued/);
  });

  it('queues nobody and says so when the start date has not arrived', async () => {
    launchCampaign.mockResolvedValue({ id: 'c1', organizationId: ORG_ID, status: 'scheduled' });

    const res = await request(app).post('/campaigns/c1/launch');

    expect(res.status).toBe(200);
    expect(getCampaignAffectedUsers).not.toHaveBeenCalled();
    expect(markUsersPending).not.toHaveBeenCalled();
    expect(res.body.message).toMatch(/scheduled/i);
  });

  it('answers 404 for a campaign of another organization', async () => {
    getCampaign.mockResolvedValue({ id: 'c1', organizationId: 'someone-else', status: 'scheduled' });
    const res = await request(app).post('/campaigns/c1/launch');
    expect(res.status).toBe(404);
    expect(launchCampaign).not.toHaveBeenCalled();
  });
});
