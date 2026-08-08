# Proposal: Workflow Builder for Onboarding/Offboarding

## Goal
Implement a visual, drag-and-drop workflow builder to automate onboarding and offboarding processes. This system will replace static, hard-coded procedures with a flexible, graph-based execution engine, allowing administrators to define custom paths for user provisioning.

## Prototype & Current State
A prototype has been implemented to validate the UX and technical feasibility:
*   **Library**: `React Flow` (`@xyflow/react`).
*   **Frontend**: `WorkflowBuilder` (`/admin/workflow-builder`) exists with a drag-and-drop sidebar and custom node types (`ActionNode`, `TriggerNode`).
*   **Backend**: `workflows` table, `WorkflowService`, and `WorkflowRoutes` are implemented.
*   **Persistence**: Workflows can be saved and loaded from the database (JSONB storage).

## Scope
1.  **Workflow Execution Engine (Backend)**
    *   Develop a service to traverse the stored JSON graph.
    *   Execute actions sequentially based on edge connections.
    *   Handle "Action" nodes (Create User, Add to Group, etc.) using existing services (`UserOnboardingService`, `GoogleWorkspaceService`).
2.  **Frontend Enhancements**
    *   **Node Configuration**: Clicking a node should open a properties panel to configure inputs (e.g., *which* group to add to).
    *   **Validation**: Prevent saving invalid graphs (e.g., disconnected nodes).
    *   **Test Run**: Wire up the "Test Run" button to trigger a dry-run execution.
3.  **Workflows List Page**
    *   Create a management page to list, edit, delete, and activate/deactivate workflows.

## Technical Specifications
### Data Model (`workflows` table)
*   `id`: UUID
*   `definition`: JSONB (React Flow format: `nodes[]`, `edges[]`)
*   `trigger_type`: string (e.g., 'manual', 'event:user_created')

### Execution Logic
*   **Traversal**: Use Breadth-First Search (BFS) or simple dependency resolution. Start from `TriggerNode`.
*   **Context**: Pass a `WorkflowContext` object between steps (containing `userId`, `email`, etc.).
*   **Error Handling**: Stop execution on error and log to `lifecycle_logs`.

## Dependencies
*   React Flow (Frontend)
*   Existing `UserOnboardingService` (Backend - for action logic)

## Risks
*   **Cyclic Dependencies**: Ensure the graph is acyclic (DAG).
*   **Long-running Processes**: Some Google API calls are slow; consider creating a background job system (BullMQ / Redis) if synchronous execution times out.
