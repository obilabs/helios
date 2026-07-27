# Add Telemetry Service

## Summary

Implement an opt-in telemetry service that sends anonymous usage data to helios.gridworx.io. This enables usage-driven development where popular API relay calls become UI features and frequent commands become buttons/shortcuts.

## Problem Statement

Currently, we have no visibility into how people use Helios:

1. **Which APIs do people call through the Developer Console?**
   - If `groups.list` is called frequently, we should build a Groups UI
   - Without data, we're guessing what to build

2. **Which commands are used most?**
   - Popular commands should become one-click buttons
   - We don't know what workflows to optimize

3. **Which modules get adopted?**
   - Should we invest more in signatures or org-chart?
   - No way to prioritize development

4. **Instance health monitoring (hosted customers)**
   - We can't proactively fix issues
   - Support is reactive, not proactive

## Proposed Solution

Create a telemetry service that:
- Is **disabled by default** for self-hosted instances
- Is **required for basic health** on hosted instances
- Collects **anonymous aggregate data only**
- Publishes usage insights publicly at helios.gridworx.io/insights

### What We Collect

```typescript
interface TelemetryPayload {
  // Required
  instance_id: string;        // Anonymous identifier
  version: string;            // Software version

  // Optional (licensed instances only)
  license_key?: string;

  // Anonymous metrics
  metrics: {
    user_count_range: string; // "1-10", "11-50", etc.
    modules_enabled: string[];
    uptime_hours: number;
    last_sync_status: "success" | "error" | "none";

    // Feature usage (aggregated counts)
    api_usage?: Record<string, number>;     // {"users.list": 42}
    command_usage?: Record<string, number>; // {"sync_users": 12}
    ui_actions?: Record<string, number>;    // {"bulk_edit": 5}
  };
}
```

### What We Never Collect

- Organization name or domain
- User names, emails, or any PII
- API request/response content
- Google Workspace credentials
- IP addresses (for self-hosted)

### Public Dashboard

All telemetry data is aggregated and displayed publicly:
- Popular API relay calls
- Common commands
- Module adoption rates
- Organization size distribution
- "What we're building next" predictions

This transparency builds trust and helps users see value in opting in.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     helios-client instance                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  TelemetryService                           ││
│  │                                                             ││
│  │  • Initialized on startup                                   ││
│  │  • Checks HELIOS_TELEMETRY_ENABLED env var                 ││
│  │  • Increments counters on API/command usage                ││
│  │  • Sends heartbeat every hour (hosted) or day (self-hosted)││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
└──────────────────────────────│───────────────────────────────────┘
                               │
                               │ POST /api/instances/heartbeat
                               │ (HTTPS)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     helios.gridworx.io                           │
│                                                                  │
│  • Receives heartbeat                                           │
│  • Stores in database (90-day retention)                        │
│  • Aggregates for public dashboard                              │
│  • No individual instance data exposed                          │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. TelemetryService Class

```typescript
// backend/src/services/telemetry.service.ts

class TelemetryService {
  private enabled: boolean;
  private instanceId: string;
  private apiUsage: Map<string, number> = new Map();
  private commandUsage: Map<string, number> = new Map();
  private uiActions: Map<string, number> = new Map();

  constructor() {
    this.enabled = process.env.HELIOS_TELEMETRY_ENABLED === 'true';
    this.instanceId = await this.getOrCreateInstanceId();
  }

  // Called when API relay is used
  trackApiCall(apiName: string) {
    if (!this.enabled) return;
    this.apiUsage.set(apiName, (this.apiUsage.get(apiName) || 0) + 1);
  }

  // Called when command is executed
  trackCommand(commandName: string) {
    if (!this.enabled) return;
    this.commandUsage.set(commandName, (this.commandUsage.get(commandName) || 0) + 1);
  }

  // Send heartbeat to helios.gridworx.io
  async sendHeartbeat() {
    if (!this.enabled) return;

    const payload = {
      instance_id: this.instanceId,
      version: pkg.version,
      license_key: process.env.HELIOS_LICENSE_KEY || null,
      metrics: {
        user_count_range: await this.getUserCountRange(),
        modules_enabled: await this.getEnabledModules(),
        uptime_hours: this.getUptimeHours(),
        last_sync_status: await this.getLastSyncStatus(),
        api_usage: Object.fromEntries(this.apiUsage),
        command_usage: Object.fromEntries(this.commandUsage),
        ui_actions: Object.fromEntries(this.uiActions),
      },
    };

    await fetch('https://helios.gridworx.io/api/instances/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Reset counters after successful send
    this.apiUsage.clear();
    this.commandUsage.clear();
    this.uiActions.clear();
  }
}
```

### 2. Instance ID Generation

```typescript
// Generated once on first boot, stored in database
async getOrCreateInstanceId(): Promise<string> {
  const existing = await db.query(`
    SELECT value FROM organization_settings
    WHERE key = 'instance_id'
  `);

  if (existing.rows[0]) {
    return existing.rows[0].value;
  }

  const instanceId = `helios_${nanoid(21)}`;
  await db.query(`
    INSERT INTO organization_settings (key, value)
    VALUES ('instance_id', $1)
  `, [instanceId]);

  return instanceId;
}
```

### 3. Integration Points

```typescript
// In developer console API proxy
app.post('/api/proxy/*', async (req, res) => {
  const apiName = extractApiName(req.path);
  telemetryService.trackApiCall(apiName);  // <-- Track usage
  // ... existing proxy logic
});

// In command handlers
async function handleSyncUsers() {
  telemetryService.trackCommand('sync_users');  // <-- Track usage
  // ... existing sync logic
}
```

### 4. Scheduled Heartbeat

```typescript
// Run on startup and then periodically
const heartbeatInterval = process.env.HELIOS_LICENSE_KEY
  ? 60 * 60 * 1000      // Hosted: hourly
  : 24 * 60 * 60 * 1000; // Self-hosted: daily

setInterval(() => telemetryService.sendHeartbeat(), heartbeatInterval);
```

## User Controls

### Self-Hosted

```env
# .env file - disabled by default
HELIOS_TELEMETRY_ENABLED=false
```

### Settings UI

Add toggle in Settings > Privacy:
- "Help improve Helios by sharing anonymous usage data"
- Link to privacy policy and public dashboard

### Hosted Instances

Basic health telemetry (uptime, version) is required.
Usage metrics (api_usage, command_usage) can be disabled in settings.

## Dependencies

- helios-web must be deployed first (provides API endpoint)
- No new npm packages required
- Uses existing database for instance_id storage

## Testing

1. Unit tests for TelemetryService
2. Integration test: verify heartbeat sends correctly
3. E2E test: disable telemetry, verify nothing sent
4. Manual test: check data appears on public dashboard

## Rollout Plan

1. **Phase 1:** Deploy helios-web with heartbeat endpoint
2. **Phase 2:** Add TelemetryService to helios-client (disabled by default)
3. **Phase 3:** Release with announcement explaining value proposition
4. **Phase 4:** Monitor opt-in rates, iterate on messaging

## Success Metrics

| Metric | Target (90 days) |
|--------|------------------|
| Opt-in rate (self-hosted) | 15% |
| Hosted compliance | 100% |
| Public dashboard visits | 500/month |
| Feature decisions informed by data | 3+ |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Low opt-in | Emphasize value (your usage → better features) |
| Privacy concerns | Aggressive documentation, open source code |
| Data breach | Collect nothing identifiable, aggregate only |
| Network failures | Graceful degradation, retry with backoff |

## Open Questions

1. Should we show telemetry status in the admin dashboard?
2. Add "community" badge for instances that opt-in?
3. Notify users when their usage influenced a feature?
