#!/bin/bash
# Documentation Cleanup Script
# Organizes 120+ markdown files into logical structure

set -e  # Exit on error

echo "=== Helios Documentation Cleanup ==="

# Move to project root
cd "$(dirname "$0")"

echo "Step 1: Moving setup/user guides..."
mv -f GOOGLE-WORKSPACE-SETUP-GUIDE.md docs/guides/ 2>/dev/null || true
mv -f PROVIDER-SETUP-GUIDE.md docs/guides/ 2>/dev/null || true
mv -f SECURITY-SERVICE-ACCOUNTS.md docs/guides/ 2>/dev/null || true
mv -f DOCKER-TESTING-GUIDE.md docs/guides/ 2>/dev/null || true
mv -f TESTING-QUICK-START.md docs/guides/ 2>/dev/null || true
mv -f MANUAL-TEST-CHECKLIST-V1.0.md docs/guides/ 2>/dev/null || true
mv -f GAM-TESTING-GUIDE.md docs/guides/ 2>/dev/null || true
mv -f GET-JWT-TOKEN.md docs/guides/ 2>/dev/null || true
mv -f QUICK-TEST-GUIDE.md docs/guides/ 2>/dev/null || true

echo "Step 2: Moving architecture documentation..."
mv -f TRANSPARENT-PROXY-ARCHITECTURE.md docs/architecture/ 2>/dev/null || true
mv -f SYNC-ARCHITECTURE-DECISION.md docs/architecture/ 2>/dev/null || true
mv -f API-DOCUMENTATION-STRATEGY.md docs/architecture/ 2>/dev/null || true
mv -f OPENAPI-IMPLEMENTATION-PLAN.md docs/architecture/ 2>/dev/null || true
mv -f REDIS-USAGE.md docs/architecture/ 2>/dev/null || true
mv -f TENANT-CLEANUP-ANALYSIS.md docs/architecture/ 2>/dev/null || true
mv -f EMAIL-FORWARDING-VIA-HIDDEN-GROUPS.md docs/architecture/ 2>/dev/null || true
mv -f EMAIL-SUFFIX-WORKFLOW.md docs/architecture/ 2>/dev/null || true
mv -f EMAIL-FORWARDING-AND-DATA-TRANSFER.md docs/architecture/ 2>/dev/null || true
mv -f UNIFIED-HTML-EDITOR-STRATEGY.md docs/architecture/ 2>/dev/null || true
mv -f PROXY-TESTING-STRATEGY.md docs/architecture/ 2>/dev/null || true
mv -f AUTOMATED-GUI-TESTING-STRATEGY.md docs/architecture/ 2>/dev/null || true
mv -f AUTOMATED-TESTING-README.md docs/architecture/ 2>/dev/null || true

echo "Step 3: Moving feature documentation..."
mv -f BULK-OPERATIONS-README.md docs/features/ 2>/dev/null || true
mv -f TEMPLATE-STUDIO-UX.md docs/features/ 2>/dev/null || true
mv -f GROUP-MAILBOX-FEASIBILITY.md docs/features/ 2>/dev/null || true
mv -f USER-PROFILE-PERMISSIONS.md docs/features/ 2>/dev/null || true
mv -f SECURITY-EVENTS-AUDIT-LOGS-IMPLEMENTATION.md docs/features/ 2>/dev/null || true
mv -f GUARDRAILS.md docs/features/ 2>/dev/null || true
mv -f UI-COMPONENTS-SUMMARY.md docs/features/ 2>/dev/null || true
mv -f GROUPS-FEATURE-COMPLETE.md docs/features/ 2>/dev/null || true

echo "Step 4: Moving session notes and status reports to archive..."
mv -f SESSION-*.md docs/archive/ 2>/dev/null || true
mv -f FINAL-*.md docs/archive/ 2>/dev/null || true
mv -f IMPLEMENTATION-*.md docs/archive/ 2>/dev/null || true
mv -f V1-*.md docs/archive/ 2>/dev/null || true
mv -f V1.0-*.md docs/archive/ 2>/dev/null || true
mv -f *-STATUS*.md docs/archive/ 2>/dev/null || true
mv -f *-COMPLETE*.md docs/archive/ 2>/dev/null || true
mv -f *-SUMMARY*.md docs/archive/ 2>/dev/null || true
mv -f FIXES-*.md docs/archive/ 2>/dev/null || true
mv -f CRITICAL-*.md docs/archive/ 2>/dev/null || true
mv -f LAUNCH-*.md docs/archive/ 2>/dev/null || true
mv -f EXPERIMENTAL-*.md docs/archive/ 2>/dev/null || true
mv -f UX-*.md docs/archive/ 2>/dev/null || true
mv -f BACKEND-*.md docs/archive/ 2>/dev/null || true
mv -f BULK-OPERATIONS-*-COMPLETE.md docs/archive/ 2>/dev/null || true
mv -f BULK-OPERATIONS-MVP-STATUS.md docs/archive/ 2>/dev/null || true
mv -f BULK-OPERATIONS-UX-MOCKUPS.md docs/archive/ 2>/dev/null || true
mv -f GOOGLE-WORKSPACE-*-RESULTS.md docs/archive/ 2>/dev/null || true
mv -f GOOGLE-WORKSPACE-MIGRATION.md docs/archive/ 2>/dev/null || true
mv -f GAM-*.md docs/archive/ 2>/dev/null || true
mv -f FEATURE-*.md docs/archive/ 2>/dev/null || true
mv -f ITFLOW-*.md docs/archive/ 2>/dev/null || true
mv -f RELEASE-*.md docs/archive/ 2>/dev/null || true
mv -f NEXT-*.md docs/archive/ 2>/dev/null || true
mv -f HELIOS-STRATEGIC-ROADMAP.md docs/archive/ 2>/dev/null || true
mv -f PORT-TRACKER.md docs/archive/ 2>/dev/null || true
mv -f PRODUCTION-ROADMAP.md docs/archive/ 2>/dev/null || true
mv -f DOCUMENTATION-INDEX.md docs/archive/ 2>/dev/null || true

echo "Step 5: Deleting obsolete temporary files..."
rm -f APP-NOW-READY-FOR-TESTING.md 2>/dev/null || true
rm -f APP-WORKING-NOW.md 2>/dev/null || true
rm -f ALL-ISSUES-FOUND.md 2>/dev/null || true
rm -f FIX-FRONTEND-ERROR.md 2>/dev/null || true
rm -f CLEANUP-TODO.md 2>/dev/null || true
rm -f READY-FOR-YOUR-TESTING.md 2>/dev/null || true
rm -f START-HERE-TESTING-PHASE.md 2>/dev/null || true
rm -f TEST-TRANSPARENT-PROXY-NOW.md 2>/dev/null || true
rm -f DELETE-USER-BUG-FIXED.md 2>/dev/null || true
rm -f ROOT-CAUSE-ANALYSIS.md 2>/dev/null || true
rm -f PREVENTION-STRATEGIES.md 2>/dev/null || true
rm -f DELEGATION-CORRECTION-IMPORTANT.md 2>/dev/null || true
rm -f OPENSPEC-INIT.md 2>/dev/null || true
rm -f OPENSPEC-STATUS-REPORT.md 2>/dev/null || true

echo "Step 6: Moving roadmap files to archive..."
mv -f FEATURE-ROADMAP.md docs/archive/ 2>/dev/null || true

echo "✅ Documentation cleanup complete!"
echo ""
echo "New structure:"
echo "  docs/guides/        - User and setup guides"
echo "  docs/architecture/  - Technical architecture docs"
echo "  docs/features/      - Feature documentation"
echo "  docs/archive/       - Historical session notes"
echo ""
echo "Root directory now contains only:"
ls -1 *.md 2>/dev/null | wc -l
echo "markdown files (should be <15)"
