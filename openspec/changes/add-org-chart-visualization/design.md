# Design Document: Org Chart Visualization

## Architecture Overview

The org chart feature consists of three main components:
1. **Data Layer:** Manager relationships stored in PostgreSQL
2. **API Layer:** RESTful endpoint providing hierarchical data
3. **Visualization Layer:** D3.js-based interactive tree component

## Data Model

### Database Schema
```sql
ALTER TABLE organization_users ADD COLUMN manager_id UUID REFERENCES organization_users(id);
ALTER TABLE gw_synced_users ADD COLUMN manager_email VARCHAR(255);
CREATE INDEX idx_users_manager ON organization_users(manager_id);
```

### Hierarchical Data Structure
```typescript
interface OrgNode {
  userId: string;
  name: string;
  email: string;
  title: string;
  department: string;
  photoUrl?: string;
  managerId?: string;
  level: number;           // Depth in hierarchy (CEO = 0)
  directReports: OrgNode[]; // Recursive children
  totalReports: number;    // Total count including indirect
}
```

## API Design

### Endpoint: GET /api/organization/org-chart
```typescript
Response: {
  success: boolean;
  data: {
    root: OrgNode;        // Top-level nodes (no manager)
    orphans: OrgNode[];   // Users with invalid manager references
    stats: {
      totalUsers: number;
      maxDepth: number;
      avgSpan: number;    // Average direct reports
    }
  }
}
```

### Caching Strategy
- Cache complete hierarchy in Redis for 5 minutes
- Invalidate on any user update
- Lazy refresh on Google Workspace sync
- Fallback to database if cache miss

## Frontend Architecture

### Component Structure
```
OrgChart/
├── OrgChart.tsx           # Main page component
├── OrgChartTree.tsx       # D3.js tree visualization
├── OrgChartList.tsx       # Hierarchical list view
├── OrgChartCard.tsx       # Card grid view
├── OrgChartNode.tsx       # Individual user node
├── OrgChartSearch.tsx     # Search functionality
├── OrgChartExport.tsx     # Export utilities
└── orgChart.css           # Styles
```

### State Management
```typescript
interface OrgChartState {
  data: OrgNode | null;
  viewMode: 'tree' | 'list' | 'card';
  searchTerm: string;
  expandedNodes: Set<string>;
  selectedNode: string | null;
  zoom: number;
  isLoading: boolean;
  error: string | null;
}
```

### D3.js Integration
- Use `d3-hierarchy` for tree layout
- Use `d3-zoom` for pan and zoom
- Use `d3-transition` for smooth animations
- Custom SVG rendering for nodes
- Canvas fallback for large trees (>500 nodes)

## Performance Considerations

### Lazy Loading Strategy
1. Initially load only top 2 levels
2. Load children on node expansion
3. Preload one level ahead on hover
4. Virtual scrolling for list view

### Optimization Techniques
- Use React.memo for node components
- Debounce search input (300ms)
- Throttle zoom events (16ms)
- Use CSS transforms for animations
- Image lazy loading with intersection observer

### Benchmarks
| Users | Initial Load | Full Expand | Search | Export |
|-------|-------------|------------|--------|--------|
| 100   | <500ms      | <1s        | <100ms | <2s    |
| 500   | <1s         | <2s        | <200ms | <5s    |
| 1000  | <2s         | <5s        | <500ms | <10s   |

## Security Considerations

### Access Control
- Respect existing user visibility permissions
- Hide sensitive fields based on viewer role
- Audit log org chart exports
- Rate limit API calls (10 req/min)

### Data Privacy
- Option to hide personal photos
- Option to mask email addresses
- Department-level view restrictions
- Export watermarking with viewer info

## Error Handling

### Common Scenarios
1. **Circular References:** Display warning, break cycle at detection point
2. **Missing Manager:** Group under "No Manager" section
3. **Large Dataset:** Suggest filtered view or pagination
4. **Slow Network:** Show progressive loading indicators
5. **Export Failure:** Retry with smaller chunks

### User Feedback
- Toast notifications for errors
- Inline help for complex features
- Loading skeletons for better UX
- Graceful degradation to list view

## Accessibility

### WCAG 2.1 AA Compliance
- Keyboard navigation (Tab, Arrow keys)
- Screen reader announcements
- High contrast mode support
- Focus indicators
- Alt text for images
- ARIA labels for interactive elements

### Keyboard Shortcuts
- `/` - Focus search
- `↑↓` - Navigate nodes
- `←→` - Collapse/expand
- `Enter` - Select node
- `Esc` - Clear selection
- `Ctrl+E` - Export menu

## Testing Strategy

### Unit Tests
- Tree building algorithm
- Circular reference detection
- Search and filter logic
- Export data generation

### Integration Tests
- API endpoint with mock data
- Component rendering
- User interactions
- View mode switching

### Performance Tests
- Load testing with various sizes
- Memory profiling
- Render performance
- Export timing

### Accessibility Tests
- Keyboard navigation
- Screen reader testing
- Color contrast validation
- Focus management

## Migration Plan

### Phase 1: Beta Release
- Feature flag for admin users
- Collect performance metrics
- Gather user feedback

### Phase 2: General Availability
- Enable for all users
- Remove Org Units from Directory
- Add to onboarding tour

### Phase 3: Enhancement
- Add advanced filters
- Implement matrix view
- Add team analytics

## Future Enhancements

### Version 2.0
- Matrix organization support (dotted line relationships)
- Team composition analytics
- Succession planning tools
- Integration with HR systems
- Real-time collaboration features

### Version 3.0
- AI-powered org optimization suggestions
- Predictive growth modeling
- Skills mapping overlay
- Cost center visualization
- Automated org chart updates from email signatures