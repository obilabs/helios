# Redis Usage in Helios Client Portal

**Last Updated:** 2025-10-31
**Status:** Minimal usage - Only for job queuing

---

## Current Usage

### 1. Bull Queue for Bulk Operations (ONLY Current Use)

Redis is currently used **exclusively** for the Bull queue system that handles asynchronous bulk operations.

**Implementation:**
- **Service:** `backend/src/services/queue.service.ts`
- **Worker:** `backend/src/workers/bulk-operation.worker.ts`
- **Queue Name:** `bulk-operations`
- **Connection:** `${REDIS_HOST}:${REDIS_PORT}` (localhost:6379 in dev)

**Features:**
- Job retry with exponential backoff (3 attempts, 2s initial delay)
- Job persistence (100 completed, 500 failed jobs kept)
- Progress tracking for bulk operations
- Job cancellation support
- Queue statistics and monitoring

**Job Types:**
```typescript
interface BulkOperationJobData {
  bulkOperationId: string;
  organizationId: string;
  operationType: string;  // create, update, delete, suspend, etc.
  items: any[];
  options?: any;
}
```

**Current Redis Keys:**
```
bull:bulk-operations:completed    # Completed jobs set
bull:bulk-operations:id           # Job ID counter (value: 1)
bull:bulk-operations:{jobId}      # Individual job data
```

**Redis Stats (Current):**
- Connected clients: 1
- Memory used: ~1 MB
- Total commands processed: 110
- Total keys: 3

---

## What Redis is NOT Used For (Yet)

### 1. Session Management ❌
**Status:** NOT implemented

The project has infrastructure for session management but it's currently using **database-only** storage:

**Evidence:**
- Backup file `auth.routes.ts.bak` contains session management code
- References to `user_sessions` table in database
- Refresh token storage planned but not active
- Cookie-based refresh tokens commented out

**What Was Planned:**
```typescript
// Store refresh token in database
const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
await db.insert('user_sessions', {
  user_id: userId,
  refresh_token_hash: refreshTokenHash,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});
```

**Current Reality:**
- JWT tokens stored in browser localStorage
- No refresh token mechanism
- No session tracking
- No Redis caching of sessions

### 2. Caching ❌
**Status:** NOT implemented

No caching layer exists for:
- Organization data
- User data
- Google Workspace sync results
- API responses
- Frequently accessed data

### 3. Real-time Features ❌
**Status:** NOT implemented

While Socket.IO is installed (`socket.io: ^4.8.1`), there's no Redis adapter for:
- Real-time progress updates (currently using polling)
- WebSocket scaling across servers
- Pub/sub for live updates

### 4. Rate Limiting ❌
**Status:** NOT implemented in Redis

Rate limiting exists via `express-rate-limit` but uses in-memory storage, not Redis:
- No distributed rate limiting
- Resets on server restart
- Can't share limits across instances

---

## Redis Configuration

### Docker Setup
```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  container_name: helios_client_redis
  ports:
    - "6379:6379"
  networks:
    - helios_client_network
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### Environment Variables
```bash
REDIS_HOST=localhost    # or 'redis' inside Docker
REDIS_PORT=6379
```

### Package Dependencies
```json
{
  "redis": "^4.6.10",          // Redis client
  "bull": "^4.16.5",            // Job queue (uses redis internally)
  "@types/bull": "^4.10.4"      // TypeScript types
}
```

---

## Potential Future Uses

### 1. Session Management (High Priority)
**Benefits:**
- Fast session lookup
- Automatic expiration with TTL
- Reduced database load
- Better security (invalidate all sessions)

**Implementation:**
```typescript
// Store session
await redis.setex(
  `session:${sessionId}`,
  7 * 24 * 60 * 60,  // 7 days
  JSON.stringify({ userId, organizationId, ... })
);

// Check session
const session = await redis.get(`session:${sessionId}`);
```

### 2. API Response Caching (Medium Priority)
**Benefits:**
- Faster API responses
- Reduced database queries
- Better user experience

**Use Cases:**
```typescript
// Cache organization data (rarely changes)
await redis.setex('org:${orgId}', 3600, JSON.stringify(orgData));

// Cache Google Workspace users (changes periodically)
await redis.setex('gw:users:${orgId}', 300, JSON.stringify(users));

// Cache user permissions
await redis.setex('perms:${userId}', 600, JSON.stringify(permissions));
```

### 3. Real-time Updates (Low Priority)
**Benefits:**
- Live progress updates for bulk operations
- Instant notification of changes
- Better UX for collaborative features

**Implementation:**
```typescript
// Replace polling with Redis pub/sub
redis.publish('bulk-op-progress', JSON.stringify({
  operationId,
  progress: 45,
  message: 'Processing 45/100 users'
}));
```

### 4. Distributed Rate Limiting (Low Priority)
**Benefits:**
- Consistent rate limits across server instances
- Protection against abuse
- Fair usage enforcement

**Implementation:**
```typescript
// Use Redis-backed rate limiter
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000,
  max: 100
});
```

### 5. Feature Flags (Low Priority)
**Benefits:**
- Toggle features without deployment
- A/B testing capabilities
- Gradual rollouts

**Implementation:**
```typescript
// Check feature flag
const isEnabled = await redis.get('feature:bulk-delete');
```

---

## Performance Considerations

### Current State
With minimal usage (only Bull queue):
- Memory footprint: <5 MB
- Negligible CPU usage
- Fast job processing
- No bottlenecks

### If Adding Sessions + Caching
Estimated for 1,000 active users:
- Memory: ~50-100 MB
- Sessions: ~1 KB each = 1 MB
- Cached data: ~50 MB (organization data, permissions, etc.)
- Commands/sec: ~100-500
- Network: Minimal (<1 MB/s)

**Recommendation:** Current Redis instance is more than sufficient for growth to 10,000 users.

---

## Monitoring Commands

### Check Current Usage
```bash
# Enter Redis CLI
docker exec -it helios_client_redis redis-cli

# View all keys
KEYS *

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# View queue stats
KEYS bull:*

# Get job count
ZCARD bull:bulk-operations:completed

# Monitor real-time commands
MONITOR
```

### Useful Queries
```bash
# Count keys by pattern
redis-cli --scan --pattern "bull:*" | wc -l

# Get memory per key
redis-cli --bigkeys

# Check slow queries
redis-cli SLOWLOG GET 10

# Check database size
redis-cli DBSIZE
```

---

## Cleanup and Maintenance

### Automatic Cleanup (Implemented)
```typescript
// In queue.service.ts
public async cleanOldJobs(grace: number = 24 * 60 * 60 * 1000): Promise<void> {
  await this.bulkOperationQueue.clean(grace, 'completed');
  await this.bulkOperationQueue.clean(grace * 7, 'failed');
}
```

**Settings:**
- Completed jobs: Removed after 24 hours
- Failed jobs: Removed after 7 days
- Last 100 completed jobs kept
- Last 500 failed jobs kept

### Manual Cleanup
```bash
# Clear all Bull queue data
docker exec helios_client_redis redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', 'bull:*')))" 0

# Clear everything (DANGEROUS)
docker exec helios_client_redis redis-cli FLUSHALL

# Clear specific queue
docker exec helios_client_redis redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', 'bull:bulk-operations:*')))" 0
```

---

## Recommendations

### Immediate (Do Now)
1. ✅ Redis is properly configured - no changes needed
2. ✅ Bull queue working correctly
3. ⏳ Consider adding basic monitoring (Redis Commander or RedisInsight)

### Short-term (Next Sprint)
1. Implement session management in Redis
   - Move from localStorage to Redis-backed sessions
   - Add refresh token support
   - Implement session invalidation
2. Add basic caching for organization data
   - Cache organization settings (1 hour TTL)
   - Cache user permissions (10 min TTL)

### Long-term (Future)
1. Add Redis pub/sub for real-time updates
   - Replace polling with WebSocket + Redis
   - Implement Socket.IO Redis adapter
2. Implement distributed rate limiting
3. Add feature flags system

### When NOT to Use Redis
- ❌ Don't cache frequently changing data (use database)
- ❌ Don't store large blobs (use S3/blob storage)
- ❌ Don't use for permanent storage (use PostgreSQL)
- ❌ Don't over-optimize (measure first)

---

## Cost Implications

### Development (Docker)
- **Cost:** Free
- **Memory:** Included in Docker Desktop limits
- **Performance:** Excellent for dev/test

### Production (Self-hosted)
- **Memory needed:** 100-500 MB for <10k users
- **Cost:** Minimal (part of existing server)
- **Recommendation:** Use same server as backend

### Production (Hosted Redis)
If using managed Redis service:
- **AWS ElastiCache:** ~$15-30/month (cache.t3.micro)
- **Redis Cloud:** Free tier (30 MB) or ~$7/month (100 MB)
- **DigitalOcean:** $15/month (1 GB)

**Recommendation:** For single-tenant deployments, use Docker on same host (cost: $0).

---

## Summary

**Current State:**
- Redis is installed and healthy ✅
- Used ONLY for Bull job queue ✅
- Minimal resource usage (<1 MB memory) ✅
- Working perfectly for bulk operations ✅

**Not Used For:**
- Session management ❌
- Caching ❌
- Real-time updates ❌
- Rate limiting ❌

**Verdict:** Redis is **under-utilized** but ready for expansion when needed. The infrastructure is in place to easily add sessions and caching without major refactoring.
