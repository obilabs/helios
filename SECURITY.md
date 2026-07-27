# Security Policy

Helios takes security seriously — it is a Google Workspace security and management
tool, so the bar is high by design. This document explains how to report
vulnerabilities and what our security practices are.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via one of:
- GitHub's **private vulnerability reporting** (Security tab → "Report a vulnerability"), or
- Email: `security@<your-domain>` <!-- set to the company security address -->

Please include: a description, steps to reproduce, affected version/commit, and impact.
We aim to acknowledge within **72 hours** and to provide a remediation timeline after
triage.

We will credit reporters who wish to be named once a fix is released.

## Supported versions

Pre-1.0: the latest `main` is supported. A formal supported-versions matrix will be
published at the first tagged release.

## Our security practices (verifiable, not "trust us")

- **Deny-by-default authorization**, enforced by tests that fail CI on regression
  (`route-auth-coverage`, `route-mount-coverage`) — an unguarded or silently-dead
  route breaks the build.
- **Least-privilege API relay**: an authorization engine (deny-by-default, per-action
  scoping, read/write/delete asymmetry, batch-safe, impersonation-subject-constrained)
  gates every proxied cloud call. Discovery never implies permission.
- **Encryption at rest** for sensitive credentials (e.g. Google service-account keys),
  through a single audited accessor.
- **Per-action audit** attributed to the acting identity.
- **Automated scanning**: CodeQL code scanning, Dependabot dependency updates, and
  OpenSSF Scorecard run in CI.

These are enforced in code and CI, so you can verify them rather than take our word.
