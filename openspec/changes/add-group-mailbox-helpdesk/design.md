# Design: Group Mailbox/Helpdesk Feature

## Context

Support teams need better coordination when handling customer emails through Google Groups. The current workflow causes collision (multiple responses), lacks accountability, and provides no metrics. This design creates a helpdesk layer on top of Google Groups without requiring email migration.

## Goals

**Goals:**
- Prevent email collision through real-time presence
- Enable ticket assignment and tracking
- Provide response time metrics
- Maintain email as primary channel
- Support team collaboration

**Non-Goals:**
- Replace Google Groups entirely
- Build full CRM functionality
- Handle non-email channels (chat, phone)
- Implement complex workflow automation

## Architecture

### System Components

```
┌─────────────────────────────────────────┐
│         Frontend (React)                 │
│  ┌──────────────────────────────────┐   │
│  │    Helpdesk Dashboard            │   │
│  │  ┌──────────┐  ┌──────────┐    │   │
│  │  │ Ticket   │  │ Presence │    │   │
│  │  │ List     │  │ System   │    │   │
│  │  └──────────┘  └──────────┘    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
           WebSocket │ HTTPS
                    │
┌─────────────────────────────────────────┐
│         Backend (Node.js)                │
│  ┌──────────────────────────────────┐   │
│  │     WebSocket Gateway            │   │
│  │  ┌──────────┐  ┌──────────┐    │   │
│  │  │ Presence │  │ Events   │    │   │
│  │  │ Manager  │  │ Emitter  │    │   │
│  │  └──────────┘  └──────────┘    │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │     Helpdesk Service             │   │
│  │  ┌──────────┐  ┌──────────┐    │   │
│  │  │ Ticket   │  │ Analytics│    │   │
│  │  │ Manager  │  │ Engine   │    │   │
│  │  └──────────┘  └──────────┘    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌─────────┐          ┌──────────┐
    │ PostgreSQL │       │ Google   │
    │ (Metadata) │       │ Groups   │
    └─────────┘          └──────────┘
```

## Data Model

### Database Schema

```sql
-- Ticket metadata (augments Google Groups emails)
CREATE TABLE helpdesk_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  google_message_id VARCHAR(255) UNIQUE NOT NULL,
  google_thread_id VARCHAR(255) NOT NULL,
  group_email VARCHAR(255) NOT NULL,
  subject TEXT,
  sender_email VARCHAR(255),
  sender_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'new',
  priority VARCHAR(20) DEFAULT 'normal',
  assigned_to UUID REFERENCES organization_users(id),
  assigned_at TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  sla_deadline TIMESTAMP,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_tickets_org_status (organization_id, status),
  INDEX idx_tickets_assigned (assigned_to),
  INDEX idx_tickets_google_msg (google_message_id)
);

-- Real-time presence tracking
CREATE TABLE helpdesk_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id),
  ticket_id UUID NOT NULL REFERENCES helpdesk_tickets(id),
  action VARCHAR(50) NOT NULL, -- 'viewing', 'typing', 'composing'
  socket_id VARCHAR(255),
  started_at TIMESTAMP DEFAULT NOW(),
  last_ping TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, ticket_id, action),
  INDEX idx_presence_ticket (ticket_id),
  INDEX idx_presence_last_ping (last_ping)
);

-- Internal notes (not sent via email)
CREATE TABLE helpdesk_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES helpdesk_tickets(id),
  author_id UUID NOT NULL REFERENCES organization_users(id),
  content TEXT NOT NULL,
  mentioned_users UUID[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_notes_ticket (ticket_id)
);
```

## API Design

### REST Endpoints

```typescript
// Ticket Management
GET    /api/helpdesk/tickets?status=new&assigned_to=me
GET    /api/helpdesk/tickets/:id
POST   /api/helpdesk/tickets/:id/assign
PATCH  /api/helpdesk/tickets/:id/status
POST   /api/helpdesk/tickets/:id/reply
POST   /api/helpdesk/tickets/:id/notes
DELETE /api/helpdesk/tickets/:id/assign

// Analytics
GET    /api/helpdesk/analytics/summary
GET    /api/helpdesk/analytics/agent/:userId
GET    /api/helpdesk/analytics/sla

// Templates
GET    /api/helpdesk/templates
POST   /api/helpdesk/templates
```

### WebSocket Events

```typescript
// Client -> Server
socket.emit('ticket:view', { ticketId });
socket.emit('ticket:typing:start', { ticketId });
socket.emit('ticket:typing:stop', { ticketId });
socket.emit('presence:ping');

// Server -> Client
socket.on('presence:update', { ticketId, viewers, typers });
socket.on('ticket:assigned', { ticketId, assignedTo });
socket.on('ticket:status', { ticketId, status });
socket.on('ticket:new', { ticket });
```

## Security Considerations

### Access Control
- Only organization members can access helpdesk
- Assignment limited to active agents
- Internal notes visible only to agents
- Customer data protected via Google Groups permissions

### Rate Limiting
- WebSocket connections: 1 per user
- API calls: 100/minute per user
- Presence updates: 1/second throttled

### Data Privacy
- No customer email content stored locally
- Only metadata and internal notes in database
- Google Groups handles email retention
- Audit log for all actions

## Performance Optimization

### Caching Strategy
- Redis for presence data (TTL: 30 seconds)
- In-memory cache for ticket list (TTL: 5 seconds)
- Browser cache for static analytics

### Scalability
- Horizontal scaling via Socket.io Redis adapter
- Database connection pooling
- Batch Google API calls
- Pagination for large ticket lists

## Migration Plan

### Rollout Phases
1. **Alpha**: Internal team testing (1 week)
2. **Beta**: 3-5 customer teams (2 weeks)
3. **GA**: All customers with feature flag (1 week)
4. **Default**: Enable for all new organizations

### Rollback Plan
- Feature flag to disable instantly
- Presence data is ephemeral (no cleanup needed)
- Ticket metadata preserved for history
- Google Groups remains source of truth

## Risks and Mitigations

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Google API rate limits | High | Medium | Implement caching, batch operations |
| WebSocket scaling issues | Medium | Low | Use Socket.io with Redis adapter |
| Data sync conflicts | Medium | Medium | Google Groups as single source of truth |
| Browser compatibility | Low | Low | Fallback to polling if WebSocket fails |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Low adoption | High | Medium | Gradual rollout, user training |
| Feature creep | Medium | High | Strict scope management |
| Support burden | Medium | Medium | Comprehensive documentation |

## Open Questions

1. Should we support multiple Google Groups per organization?
2. How long to retain presence history?
3. Should templates be shareable across organizations?
4. Do we need mobile app support initially?

## Decisions

- **Decision**: Use Socket.io over raw WebSockets
  - **Rationale**: Better fallback support, reconnection handling
  - **Alternatives**: ws, raw WebSockets

- **Decision**: Store only metadata, not email content
  - **Rationale**: Privacy, storage costs, Google Groups is source of truth
  - **Alternatives**: Cache email content, full email storage

- **Decision**: Implement presence with 30-second timeout
  - **Rationale**: Balance between real-time and performance
  - **Alternatives**: 10 seconds (too aggressive), 60 seconds (too slow)