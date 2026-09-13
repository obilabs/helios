# Helios

**Self-hosted Google Workspace administration for organizations that own their data.**
Microsoft 365 alongside: users, groups and licences.

A [ObiLabs](https://obilabs.dev) project. Free and open source (AGPL-3.0) — self-host it for as long as you like.

🚧 Developer Preview (Alpha) 🚧

This project is currently in active development. Features, database schemas, and APIs are subject to change. It is currently intended for developers and testing environments.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Options                            │
│                                                                 │
│  ┌─────────────────────┐          ┌─────────────────────┐       │
│  │    Self-Hosted      │    OR    │      Hosted         │       │
│  │                     │          │                     │       │
│  │  • Free forever     │          │  • Coming Soon      │       │
│  │  • Your server      │          │  • We manage it     │       │
│  │  • Full control     │          │  • Auto-updates     │       │
│  │  • GitHub support   │          │  • Chat support     │       │
│  │                     │          │                     │       │
│  │  git clone & go     │          │  obilabs.dev │       │
│  └─────────────────────┘          └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## What is Helios?

Helios is a web-based admin portal for Google Workspace, with Microsoft 365 alongside it. It gives you a modern UI for managing users, groups, email signatures, lifecycle automation and licences — while keeping your data, and the credentials that reach your tenant, on your own infrastructure — apart from optional, off-by-default connections listed under [Privacy & Telemetry](#privacy--telemetry). Every action is logged: who did what, when.

Google Workspace is the primary platform. Microsoft 365 support covers users, groups and licences (create, update, licence, disable, delete) and is CLI-first; deeper Microsoft management (Exchange, mailboxes, SharePoint) is deliberately out of scope.

### Key Features

| Feature | Description |
|---------|-------------|
| **User Management** | View, search, edit users. Bulk import via CSV. |
| **Groups & Org Units** | Manage groups, membership, org structure. |
| **Email Signatures** | Dynamic templates with variables. Deploy directly to Gmail. |
| **Org Chart** | Visual reporting relationships. |
| **Lifecycle Automation** | Onboarding/offboarding templates and workflows. |
| **API Proxy Console** | Direct Google Workspace API access with full audit trail. |
| **Asset Sharing** | Proxy files from private Drive with branded URLs. |

### Why Helios exists

[GAM](https://github.com/GAM-team/GAM) and [PSGSuite](https://github.com/SCRT-HQ/PSGSuite) are excellent, and if you are comfortable in a terminal you should use them. Helios started as a web front end for them, for the admins who aren't. Working out what that interface needed — above all a tamper-evident audit trail on every action, and delegated access that is granted rather than shared — turned it into a ground-up build on the same Google APIs. Helios owes those projects its understanding of the problem.

### Why Self-Hosted?

- **Data Sovereignty** - Your data stays on your infrastructure and talks only to your own Google / Microsoft tenant, except for optional connections that are off by default (usage telemetry, an AI provider you configure, licence validation when a licence key is set)
- **No Per-User Fees** - One fixed cost, not $3-5/user/month like SaaS alternatives
- **Full Control** - Customize, extend, integrate however you want
- **Compliance Ready** - Every action logged for audit

---

## Quick Start

### Option 1: Self-Hosted (Free)

```bash
# Clone the repository
git clone https://github.com/obilabs/helios.git
cd helios

# Copy environment template and configure
cp .env.example .env
# Edit .env with your secrets (DB_PASSWORD, JWT_SECRET, etc.).
# Generate each secret with: openssl rand -hex 32
# The backend refuses to start if JWT_SECRET is missing, shorter than
# 32 characters, or still a placeholder.

# Production
docker compose up -d --build

# First run: the setup wizard asks for a one-time setup token, printed by the
# backend at boot (and stored in the backend_data volume until setup completes)
docker compose logs backend | grep 'setup token'
# Access: http://localhost and paste the token into the setup wizard
# (to preset it instead, set HELIOS_SETUP_TOKEN in the backend environment)

# Development (with hot-reload and default admin)
docker compose -f docker-compose.dev.yml up -d --build
# Access: http://localhost
# Default login: admin@example.com / admin123
```

| File | Purpose |
|------|---------|
| `docker-compose.yml` | **Production** - Secure defaults, requires `.env` configuration |
| `docker-compose.dev.yml` | **Development** - Hot reload, default admin credentials |

See [docs/guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md](docs/guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md) for Google Workspace service account configuration.

### Option 2: Hosted by Us — coming soon

Not available yet. When it is: we run the server, you keep full admin access, and we never access your data. Watch [obilabs.dev](https://obilabs.dev). Paid setup and install help for your own server is available now — [info@obilabs.dev](mailto:info@obilabs.dev).

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Cache:** Redis
- **Storage:** MinIO (S3-compatible)
- **Deployment:** Docker Compose

---

## Privacy & Telemetry

### What We Collect (If Enabled)

Telemetry is **disabled by default** for self-hosted instances.

If you choose to enable it (`HELIOS_TELEMETRY_ENABLED=true`), the instance sends a heartbeat (daily, or hourly when a licence key is set) containing:
- A random instance ID, the Helios version and uptime
- A user count range and the list of enabled modules
- Last sync status (success / error / none)
- Counts of API calls, commands and UI actions by name
- The licence key, if one is set

We **never** collect:
- Your organization name or domain
- User names, emails, or any PII
- Your Google Workspace data

The payload is defined in [`backend/src/services/telemetry.service.ts`](backend/src/services/telemetry.service.ts).

### How to Control Telemetry

```env
# In your .env file
HELIOS_TELEMETRY_ENABLED=false  # Default: disabled
```

### Other optional outbound connections

- **AI assistant** — disabled until an admin enables it and configures an endpoint. When enabled, prompts and the data the assistant is asked about go to the endpoint you choose (which can be a model you host yourself).
- **Licence validation** — only when `HELIOS_LICENSE_KEY` is set. Without a key, Helios runs in community mode and makes no licence calls.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Helios Instance                         │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Frontend   │  │   Backend   │  │  Database   │              │
│  │  (React)    │──│  (Express)  │──│ (Postgres)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                          │                                       │
│                          │ Google Workspace API                  │
│                          ▼                                       │
│                   ┌─────────────┐                                │
│                   │   Google    │                                │
│                   │  Workspace  │                                │
│                   └─────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Optional telemetry (if enabled)
                          ▼
                   ┌─────────────┐
                   │ helios-web  │
                   │ (obilabs)  │
                   └─────────────┘
```

Your instance talks to Google Workspace using your own service account. Optionally, it can send anonymous health/usage data to obilabs.dev.

---

## Comparison

| Feature | Helios | BetterCloud/GAT | GAM (CLI) |
|---------|--------|-----------------|-----------|
| Data Location | Your Infrastructure | SaaS Cloud | Local Machine |
| Interface | Modern Web UI | Modern Web UI | Command Line |
| API Access | Full + Logged | Limited | Full |
| Audit Trail | Every Action Logged | Varies | Manual |
| Cost Model | Free or Fixed | $30-60/user/year | Free |
| Setup | Docker Compose | SaaS signup | OAuth/service-account setup |

---

## Related Projects

| Project | License | Purpose |
|---------|---------|---------|
| **helios** (this) | AGPL-3.0 | Google Workspace & Microsoft 365 administration, single organization |
| [aegis](https://github.com/obilabs/aegis) | AGPL-3.0 | IT service management with an append-only, auditable record |
| [obilabs-platform](https://github.com/obilabs/obilabs-platform) → MTP | BSL 1.1 | Multi-tenant portal for MSPs managing clients across ObiLabs products |
| [rubric](https://github.com/obilabs/rubric) | Apache-2.0 | Git-native question-bank format; the quiz engine behind training content |

Product clients (Helios, Aegis) are free and open source. MTP and services fund the work.

---

## Documentation

| Document | Description |
|----------|-------------|
| [GOOGLE-WORKSPACE-SETUP-GUIDE.md](docs/guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md) | Google Workspace integration |
| [MICROSOFT-365-SETUP-GUIDE.md](docs/guides/MICROSOFT-365-SETUP-GUIDE.md) | Microsoft 365 integration |
| [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | System architecture |
| [DESIGN-SYSTEM.md](docs/architecture/DESIGN-SYSTEM.md) | UI/UX guidelines |

---

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

```bash
# Run development environment
cd backend && npm run dev
cd frontend && npm run dev

# Run tests
npm test
```

---

## License

**AGPL-3.0** — free and open source. If you run a modified version as a network service, you must make your source available under the same license (anti-lock-in).

See [LICENSE](LICENSE) for details.

---

## Support

- **Self-hosted:** [GitHub Discussions](https://github.com/obilabs/helios/discussions)
- **Hosted customers:** Chat support via your dashboard

---

## About

Built by [ObiLabs](https://obilabs.dev) — self-hostable IT and security tools for organizations that want to own their data. We also offer:
- **Setup & install services** for your own server
- **MTP:** the multi-tenant portal for MSPs and IT providers who manage many Helios and Aegis installs

Contact: [info@obilabs.dev](mailto:info@obilabs.dev)

---

_Built with AI-assisted development ([Claude Code](https://claude.com/claude-code)), under human direction and review._
