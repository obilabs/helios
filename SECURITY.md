# Security Policy

Helios takes security seriously — it is a Google Workspace security and management
tool, so the bar is high by design. This document explains how to report
vulnerabilities and what our security practices are.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through
[GitHub's private vulnerability reporting](https://github.com/obilabs/helios/security/advisories/new)
(Security tab → "Report a vulnerability"). That channel is monitored and keeps the
report confidential until a fix ships.

Please include: a description, steps to reproduce, the affected version or commit, and
the impact you believe it has.

**What happens next, and when:**

| Stage | Target |
|---|---|
| Acknowledgement that a human has read it | 3 business days |
| Initial assessment and severity | 10 business days |
| Fix or documented mitigation for high/critical | 90 days from the acknowledgement |
| Public advisory | With the fix, or at 90 days, whichever comes first |

If a report goes unanswered past those targets, you are free to disclose publicly; we
would rather be held to a deadline than have a silent report sit forever.

**Scope.** This repository's code and its CI configuration. Findings that need an
already-compromised administrator account, physical access to the host, or a
misconfiguration of the operator's own Google Workspace tenant are out of scope.

**Safe harbour.** We will not pursue or support legal action against research done in
good faith under this policy: no privacy violation, no data destruction, no service
degradation, and no access beyond what is needed to demonstrate the issue.

We credit reporters who wish to be named once a fix is released.

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
