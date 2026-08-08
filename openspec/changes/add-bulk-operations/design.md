# Bulk Operations Framework - Design Document

## Architecture Overview

The bulk operations framework consists of four main components:

### 1. Frontend Components
```
/frontend/src/pages/BulkOperations.tsx       - Main bulk operations page
/frontend/src/components/BulkEditor.tsx      - Visual bulk editor grid
/frontend/src/components/CsvImporter.tsx     - CSV upload and validation
/frontend/src/components/BulkPreview.tsx     - Change preview dialog
/frontend/src/components/OperationProgress.tsx - Real-time progress tracker
/frontend/src/services/bulk-operations.service.ts - API client
```

### 2. Backend Services
```
/backend/src/routes/bulk-operations.routes.ts - API endpoints
/backend/src/services/bulk-operations.service.ts - Business logic
/backend/src/services/csv-parser.service.ts   - CSV parsing/validation
/backend/src/services/queue.service.ts        - Job queue management
/backend/src/workers/bulk-operation.worker.ts - Async job processing
```

### 3. Database Schema
```sql
-- Bulk operation tracking
bulk_operations (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  operation_type VARCHAR(50), -- 'user_update', 'group_membership', etc.
  status VARCHAR(20), -- 'pending', 'processing', 'completed', 'failed'
  total_items INTEGER,
  processed_items INTEGER,
  success_count INTEGER,
  failure_count INTEGER,
  input_data JSONB, -- Original CSV/selection data
  results JSONB, -- Per-item results
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP,
  completed_at TIMESTAMP
)

-- Operation templates for reuse
bulk_operation_templates (
  id UUID PRIMARY KEY,
  organization_id UUID,
  name VARCHAR(255),
  operation_type VARCHAR(50),
  template_data JSONB,
  created_by UUID,
  created_at TIMESTAMP
)
```

### 4. Queue System
- Use Bull queue with Redis backend (already have Redis container)
- Separate queues for different operation types
- Configurable concurrency limits
- Automatic retry with exponential backoff
- Dead letter queue for failed operations

## Data Flow

### CSV Import Flow
1. User uploads CSV file
2. Frontend validates basic format
3. Backend parses and validates data:
   - Check required fields
   - Validate data types
   - Check permissions
   - Verify referenced entities exist
4. Generate preview showing:
   - Items to be created/updated/deleted
   - Validation warnings
   - Estimated processing time
5. User confirms or cancels
6. If confirmed, create bulk_operation record and queue job
7. Worker processes items in batches:
   - Apply changes to database
   - Sync to Google Workspace if needed
   - Update progress in bulk_operations table
8. Send real-time updates via WebSocket/SSE
9. On completion, generate downloadable report

### Visual Selection Flow
1. User navigates to Users/Groups/OUs page
2. Enables bulk selection mode
3. Selects multiple items via checkboxes
4. Clicks "Bulk Actions" button
5. Chooses action from dropdown
6. Fills in bulk update form
7. Same preview/confirm/process flow as CSV

## CSV Format Specifications

### User Import/Update CSV
```csv
email,firstName,lastName,department,title,organizationalUnit,action
john.doe@company.com,John,Doe,Engineering,Senior Developer,/Engineering,update
jane.smith@company.com,Jane,Smith,Marketing,Marketing Manager,/Marketing,create
old.employee@company.com,,,,,,delete
```

### Group Membership CSV
```csv
groupEmail,userEmail,action
engineering-team@company.com,john.doe@company.com,add
marketing-team@company.com,jane.smith@company.com,add
old-team@company.com,old.employee@company.com,remove
```

### Fields Mapping
- Support Google Admin Console export format
- Auto-detect column headers
- Allow custom field mapping UI
- Validate against Google Workspace schema

## Error Handling & Recovery

### Validation Errors
- Pre-flight validation catches most issues
- Clear error messages with row/column references
- Option to download errors as CSV
- Partial success not allowed (all or nothing)

### Processing Errors
- Automatic retry for transient errors (network, rate limits)
- Manual retry option for failed operations
- Detailed error logs per item
- Rollback capability for critical failures

### Google API Limits
- Respect rate limits (1500 requests/minute)
- Implement exponential backoff
- Queue throttling for large operations
- Estimate completion time based on limits

## Performance Considerations

### Batch Processing
- Process items in batches of 10-50
- Parallel processing where possible
- Database transactions per batch
- Progress updates every 10 items or 5 seconds

### Large File Handling
- Stream CSV parsing (don't load entire file)
- Client-side file size limit (10MB)
- Server-side row limit (10,000 per operation)
- Pagination for result viewing

### Optimization
- Database connection pooling
- Prepared statements for repeated operations
- Caching for frequently accessed data
- Lazy loading for preview data

## Security & Compliance

### Authorization
- Require admin role for bulk operations
- Audit log all bulk operations
- IP address and user agent tracking
- Optional approval workflow for large operations

### Data Protection
- Sanitize CSV input to prevent injection
- Validate all data types and ranges
- Encrypt sensitive data in transit and at rest
- PII masking in logs

### Compliance
- GDPR right to be forgotten (bulk delete)
- Audit trail retention (90 days minimum)
- Export audit logs for compliance reporting
- Data residency considerations

## User Interface Design

### Bulk Operations Dashboard
```
┌─────────────────────────────────────────────┐
│  Bulk Operations                            │
│                                              │
│  ┌─────────────┐ ┌─────────────┐            │
│  │ Import CSV  │ │ Export Data │            │
│  └─────────────┘ └─────────────┘            │
│                                              │
│  Recent Operations                           │
│  ┌──────────────────────────────────────┐   │
│  │ Date     Type      Items   Status    │   │
│  │ Today    Users     250     Complete  │   │
│  │ Today    Groups    50      Failed    │   │
│  │ 12/1     Users     1000    Complete  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Templates                                   │
│  ┌──────────────────────────────────────┐   │
│  │ • Monthly Department Update           │   │
│  │ • New Hire Onboarding                │   │
│  │ • Quarterly Access Review             │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### CSV Import Wizard
```
Step 1: Upload File
Step 2: Map Columns
Step 3: Validate Data
Step 4: Preview Changes
Step 5: Confirm & Execute
Step 6: View Results
```

## Integration Points

### Google Workspace Admin SDK
- Users API for user operations
- Groups API for group operations
- Directory API for org units
- Batch request support where available

### Existing Helios Features
- Reuse authentication/authorization
- Integrate with existing user/group services
- Update sync status after bulk operations
- Trigger webhooks for external systems

### Future Enhancements
- Scheduled bulk operations
- Conditional logic (if X then Y)
- Multi-step workflows
- External data source integration

## Testing Strategy

### Unit Tests
- CSV parser edge cases
- Validation logic
- Queue processing
- Error handling

### Integration Tests
- End-to-end CSV import
- Google API interactions
- Database transactions
- Progress tracking

### Performance Tests
- 1000+ item operations
- Concurrent operations
- Memory usage monitoring
- API rate limit handling

### User Acceptance Tests
- Real-world CSV files
- Common error scenarios
- Recovery procedures
- UI responsiveness

## Migration & Rollout

### Phase 1: MVP (Week 1-2)
- Basic CSV import for users
- Simple progress tracking
- Error reporting
- Manual retry

### Phase 2: Enhanced (Week 3-4)
- Visual bulk editor
- Group operations
- Templates
- Advanced validation

### Phase 3: Production (Week 5-6)
- Performance optimization
- Full error recovery
- Audit logging
- Documentation

## Success Metrics
- Operation completion rate > 95%
- Average processing time < 1 second per item
- User satisfaction score > 4/5
- Support ticket reduction by 50%
- Time saved: 8 hours → 30 minutes for 500 users