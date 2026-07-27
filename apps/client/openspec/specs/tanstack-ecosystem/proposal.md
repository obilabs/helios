# TanStack Ecosystem Adoption Proposal

## Executive Summary

This proposal outlines a comprehensive adoption strategy for TanStack's ecosystem (Query, Table, Form) to maximize benefits across Helios's data management, UI components, and automation framework.

**Key Benefits:**
- 40-60% reduction in data fetching boilerplate
- Type-safe, declarative form handling for complex workflows
- Robust table implementation with virtual scrolling and column resizing
- Foundation for plugin-based workflow automation

## Current State Analysis

### Data Fetching (Problem)
```typescript
// Current: 30+ lines per component
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  setLoading(true);
  service.getData()
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);
```

Issues:
- Duplicate state management in every component
- No caching or request deduplication
- Manual refetch logic
- No background synchronization
- Inconsistent error handling

### Forms (Problem)
```typescript
// Current: Manual nested state updates
const handleGoogleServiceToggle = (service: keyof GoogleServices) => {
  setTemplate(prev => ({
    ...prev,
    googleServices: {
      ...prev.googleServices,
      [service]: !prev.googleServices[service]
    }
  }));
};
```

Issues:
- 30+ fields in onboarding/offboarding templates
- No built-in validation
- Manual dirty tracking
- Difficult array/object field management
- No type-safe field access

### Tables (Problem)
- Custom flexbox CSS causing alignment issues
- No built-in column resizing
- Manual sorting/filtering implementation
- No virtual scrolling for large datasets

---

## TanStack Solutions

### 1. TanStack Query v5

**What it provides:**
- Automatic caching and request deduplication
- Background refetching and stale-while-revalidate
- Optimistic updates for mutations
- Built-in polling with smart cancellation
- Dependent queries for cascading dropdowns

**Transform:**
```typescript
// After: 3 lines, fully featured
const { data: templates, isLoading, error, refetch } = useQuery({
  queryKey: ['templates'],
  queryFn: templatesService.getAll,
  staleTime: 5 * 60 * 1000, // 5 min cache
});

// Mutations with optimistic updates
const createMutation = useMutation({
  mutationFn: templatesService.create,
  onMutate: async (newTemplate) => {
    await queryClient.cancelQueries({ queryKey: ['templates'] });
    const previous = queryClient.getQueryData(['templates']);
    queryClient.setQueryData(['templates'], old => [...old, newTemplate]);
    return { previous };
  },
  onError: (err, _, context) => {
    queryClient.setQueryData(['templates'], context.previous);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
});
```

**Bulk Operation Polling:**
```typescript
// Smart polling that stops when complete
const { data: operation } = useQuery({
  queryKey: ['bulkOperation', operationId],
  queryFn: () => bulkService.getStatus(operationId),
  refetchInterval: (data) =>
    data?.status === 'completed' || data?.status === 'failed'
      ? false : 2000,
  enabled: !!operationId,
});
```

### 2. TanStack Form v1

**What it provides:**
- Deeply nested Object/Array fields with full TypeScript inference
- Plugin architecture for custom field types
- Async validation with debouncing
- Standard Schema spec (Zod, Valibot, ArkType)
- Framework agnostic core (useful for future mobile app)

**Transform for Onboarding Templates:**
```typescript
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';

const onboardingSchema = z.object({
  name: z.string().min(1, 'Name required'),
  googleServices: z.object({
    gmail: z.boolean(),
    drive: z.boolean(),
    calendar: z.boolean(),
  }),
  sharedDriveAccess: z.array(z.object({
    driveId: z.string().min(1, 'Drive ID required'),
    role: z.enum(['reader', 'commenter', 'writer', 'organizer']),
  })),
  steps: z.array(z.object({
    type: z.enum(['create_accounts', 'assign_groups', 'send_email', 'custom']),
    delay: z.object({
      value: z.number().min(0),
      unit: z.enum(['minutes', 'hours', 'days']),
    }),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'in']),
      value: z.union([z.string(), z.array(z.string())]),
    })),
  })),
});

function OnboardingTemplateEditor({ template }) {
  const form = useForm({
    defaultValues: template,
    validatorAdapter: zodValidator(),
    validators: {
      onChange: onboardingSchema,
    },
    onSubmit: async ({ value }) => {
      await templatesService.save(value);
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field name="name">
        {(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>

      {/* Array fields with full type inference */}
      <form.Field name="sharedDriveAccess" mode="array">
        {(field) => (
          <>
            {field.state.value.map((_, i) => (
              <form.Field key={i} name={`sharedDriveAccess[${i}].driveId`}>
                {(subField) => <DriveSelector {...subField} />}
              </form.Field>
            ))}
            <button onClick={() => field.pushValue({ driveId: '', role: 'reader' })}>
              Add Drive
            </button>
          </>
        )}
      </form.Field>
    </form>
  );
}
```

### 3. TanStack Table v8

**What it provides:**
- Headless table logic (we own the UI)
- Built-in column sizing and resizing
- Virtual scrolling via TanStack Virtual
- Sorting, filtering, grouping, pagination
- Column visibility management

**Transform for UserList:**
```typescript
import { useReactTable, getCoreRowModel, getFilteredRowModel } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

const columns = [
  columnHelper.accessor('firstName', {
    header: 'First Name',
    size: 100,
    enableResizing: true,
  }),
  columnHelper.accessor('lastName', {
    header: 'Last Name',
    size: 100,
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    size: 200,
  }),
  // ... rest of columns
];

function UserTable({ users }) {
  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
  });

  const { rows } = table.getRowModel();

  // Virtual scrolling for 10k+ users
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  return (
    <div ref={tableContainerRef} style={{ height: '600px', overflow: 'auto' }}>
      <table style={{ width: table.getTotalSize() }}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  style={{ width: header.getSize() }}
                  onMouseDown={header.getResizeHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const row = rows[virtualRow.index];
            return (
              <tr key={row.id} style={{ height: virtualRow.size }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Automation Framework Integration

### Workflow Builder with TanStack Form

The plugin architecture of TanStack Form maps perfectly to workflow automation:

```typescript
// Workflow step field plugins
const workflowFieldPlugins = {
  // User/group selection
  'user-selector': {
    component: UserSelectorField,
    validator: z.string().uuid(),
  },

  // Platform picker (Google, Microsoft, Slack)
  'platform-picker': {
    component: PlatformPickerField,
    validator: z.array(z.enum(['google_workspace', 'microsoft_365', 'slack'])),
  },

  // Condition builder (if/then logic)
  'condition-builder': {
    component: ConditionBuilderField,
    validator: z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'in', 'greater_than']),
      value: z.unknown(),
    }),
  },

  // Delay/schedule picker
  'delay-picker': {
    component: DelayPickerField,
    validator: z.object({
      value: z.number().min(0),
      unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
    }),
  },

  // Approval chain builder
  'approval-chain': {
    component: ApprovalChainField,
    validator: z.array(z.object({
      approverType: z.enum(['user', 'manager', 'role']),
      approverId: z.string().optional(),
      role: z.string().optional(),
      timeout: z.number().optional(),
    })),
  },
};

// Dynamic workflow step schema
const workflowStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_accounts'),
    platforms: z.array(z.string()),
    delay: delaySchema,
    conditions: z.array(conditionSchema),
  }),
  z.object({
    type: z.literal('assign_groups'),
    groups: z.array(z.string()),
    delay: delaySchema,
    conditions: z.array(conditionSchema),
  }),
  z.object({
    type: z.literal('send_notification'),
    template: z.string(),
    recipients: z.array(z.string()),
    delay: delaySchema,
  }),
  z.object({
    type: z.literal('request_approval'),
    approvalChain: approvalChainSchema,
    timeout: z.number(),
    onTimeout: z.enum(['approve', 'reject', 'escalate']),
  }),
  z.object({
    type: z.literal('custom_webhook'),
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    headers: z.record(z.string()),
    body: z.string().optional(),
  }),
]);
```

### Request Forms with Dynamic Schema

```typescript
// Request type definitions stored in DB
interface RequestTypeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'access' | 'equipment' | 'leave' | 'custom';
  fields: RequestFieldDefinition[];
  approvalWorkflow: string; // workflow ID
  visibleTo: string[]; // group IDs
}

interface RequestFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'user-selector' | 'date' | 'file' | 'condition-builder';
  required: boolean;
  options?: string[]; // for select
  validation?: Record<string, any>; // Zod-compatible
  dependsOn?: {
    field: string;
    condition: 'equals' | 'not_equals' | 'in';
    value: any;
  };
}

// Dynamic form generation
function RequestForm({ requestType }: { requestType: RequestTypeDefinition }) {
  const schema = useMemo(() =>
    generateZodSchema(requestType.fields),
    [requestType.fields]
  );

  const form = useForm({
    defaultValues: generateDefaultValues(requestType.fields),
    validatorAdapter: zodValidator(),
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      await requestsService.create({
        typeId: requestType.id,
        data: value,
      });
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      {requestType.fields.map(fieldDef => {
        const FieldComponent = workflowFieldPlugins[fieldDef.type]?.component || TextInput;

        // Handle conditional visibility
        if (fieldDef.dependsOn) {
          const dependentValue = form.getFieldValue(fieldDef.dependsOn.field);
          if (!evaluateCondition(fieldDef.dependsOn, dependentValue)) {
            return null;
          }
        }

        return (
          <form.Field key={fieldDef.key} name={fieldDef.key}>
            {(field) => (
              <FieldComponent
                field={field}
                label={fieldDef.label}
                options={fieldDef.options}
                required={fieldDef.required}
              />
            )}
          </form.Field>
        );
      })}
    </form>
  );
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Install & Setup:**
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Create Query Provider:**
```typescript
// src/providers/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export function QueryProvider({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**Convert Services to Query Hooks:**
```typescript
// src/hooks/queries/useTemplates.ts
export function useTemplates() {
  return useQuery({
    queryKey: ['templates', 'onboarding'],
    queryFn: templatesService.getOnboardingTemplates,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['template', id],
    queryFn: () => templatesService.getById(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: templatesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}
```

**Files to update:**
- `App.tsx` - Add QueryProvider
- `OnboardingTemplates.tsx` - Use useTemplates()
- `OffboardingTemplates.tsx` - Use useTemplates()

### Phase 2: Table Migration (Week 2-3)

**Install:**
```bash
npm install @tanstack/react-table @tanstack/react-virtual
```

**Create reusable DataTable component:**
```typescript
// src/components/ui/DataTable.tsx
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
  enableVirtualization?: boolean;
  enableColumnResizing?: boolean;
  enableSorting?: boolean;
  enableFiltering?: boolean;
}

export function DataTable<T>({ ... }: DataTableProps<T>) {
  // Implementation
}
```

**Migrate:**
- `UserList.tsx` → Use DataTable
- Groups table
- Audit logs table

### Phase 3: Form Migration (Week 3-4)

**Install:**
```bash
npm install @tanstack/react-form @tanstack/zod-form-adapter zod
```

**Create form components:**
```typescript
// src/components/forms/FormField.tsx
// src/components/forms/ArrayField.tsx
// src/components/forms/ConditionalField.tsx
```

**Migrate:**
- `OnboardingTemplateEditor.tsx`
- `OffboardingTemplateEditor.tsx`
- `AddUser.tsx` forms

### Phase 4: Workflow Builder (Week 4-6)

**Build on Form foundation:**
- Create workflow field plugins
- Build WorkflowStepEditor component
- Implement request form generator
- Add approval chain builder

---

## Migration Metrics

| Component | Before (LOC) | After (LOC) | Reduction |
|-----------|-------------|-------------|-----------|
| OnboardingTemplates.tsx | ~150 | ~60 | 60% |
| OnboardingTemplateEditor.tsx | ~700 | ~350 | 50% |
| UserList.tsx | ~1700 | ~400 | 75% |
| Data fetching per component | ~30 | ~5 | 85% |

---

## Risk Mitigation

1. **Incremental adoption** - Each phase is independent and adds value
2. **Parallel running** - Keep old components until new ones are validated
3. **Type safety** - TypeScript ensures compatibility
4. **Testing** - Add tests for query hooks and form validation

---

## Dependencies

```json
{
  "@tanstack/react-query": "^5.x",
  "@tanstack/react-query-devtools": "^5.x",
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-virtual": "^3.x",
  "@tanstack/react-form": "^1.x",
  "@tanstack/zod-form-adapter": "^1.x",
  "zod": "^3.x"
}
```

---

## Sources

- [TanStack Form v1](https://tanstack.com/form/latest) - Form state management
- [TanStack Form v1 Announcement](https://tanstack.com/blog/announcing-tanstack-form-v1) - Features overview
- [TanStack Query v5](https://tanstack.com/query/v5/docs/framework/react/overview) - Server state management
- [TanStack Table Column Sizing](https://tanstack.com/table/v8/docs/guide/column-sizing) - Column management
- [TanStack Table Virtualization](https://tanstack.com/table/v8/docs/guide/virtualization) - Virtual scrolling
- [Column Resizing Performance](https://tanstack.com/table/v8/docs/framework/react/examples/column-resizing-performant) - 60fps resizing
