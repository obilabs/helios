# Add Group Mailbox/Helpdesk Feature

## Why

Support teams using Google Groups for helpdesk operations face email collision (multiple agents responding to the same ticket), lack of assignment tracking, and no visibility into who's handling what. This causes duplicated work, poor customer experience, and no accountability metrics. Existing helpdesk tools require migrating away from email entirely, which teams resist.

## What Changes

- Add real-time presence system showing who's viewing/typing in emails
- Implement ticket assignment system (self-assign, team assign)
- Add status tracking (New, In Progress, Pending, Resolved)
- Create collaborative features (internal notes, @mentions)
- Build analytics dashboard for response metrics
- **BREAKING**: Requires WebSocket connection for real-time features

## Impact

- **Affected specs:** helpdesk (new), presence (new), notifications (modified)
- **Affected code:**
  - New: `frontend/src/pages/Helpdesk.tsx`
  - New: `backend/src/services/helpdesk.service.ts`
  - New: `backend/src/websocket/presence.gateway.ts`
  - Modified: App routing to include helpdesk section
- **Dependencies:** socket.io, socket.io-client for WebSocket support
- **Database:** New tables for ticket metadata and presence tracking