# Helios

**Self-hosted Google Workspace administration portal.**

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
│  │  git clone & go     │          │  helios.gridworx.io │       │
│  └─────────────────────┘          └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## What is Helios?

Helios is a web-based admin portal for Google Workspace. It gives you a modern UI for managing users, groups, email signatures, and more—while keeping all your data on your own infrastructure.

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

### Why Self-Hosted?

- **Data Sovereignty** - Your data never leaves your infrastructure
- **No Per-User Fees** - One fixed cost, not $3-5/user/month like SaaS alternatives
- **Full Control** - Customize, extend, integrate however you want
- **Compliance Ready** - Every action logged for audit

---

## Quick Start

### Option 1: Self-Hosted (Free)

```bash
# Clone the repository
git clone https://github.com/gridworx/helios-client.git
cd helios-client

# Copy environment template and configure
cp .env.example .env
# Edit .env with your secrets (DB_PASSWORD, JWT_SECRET, etc.)

# Production
docker compose up -d --build
# Access: http://localhost (setup wizard on first run)

# Development (with hot-reload and default admin)
docker compose -f docker-compose.dev.yml up -d --build
# Access: http://localhost
# Default login: admin@example.com / admin123
```

| File | Purpose |
|------|---------|
| `docker-compose.yml` | **Production** - Secure defaults, requires `.env` configuration |
| `docker-compose.dev.yml` | **Development** - Hot reload, default admin credentials |

See [docs/guides/SETUP.md](docs/guides/SETUP.md) for complete setup including Google Workspace service account configuration.

### Option 2: Hosted by Us

Visit [helios.gridworx.io](https://helios.gridworx.io) to sign up.

| Plan | Price | Includes |
|------|-------|----------|
| Starter | TBD | Hosting, backups, updates, email support |
| Pro | TBD | + Custom domain, chat support, priority updates |

**What hosted means:** We run the server infrastructure. You have full admin access. We never access your data.

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

If you choose to enable it, we collect:
- Instance health (version, uptime)
- Anonymous usage metrics (user count range, enabled modules)

We **never** collect:
- Your organization name or domain
- User names, emails, or any PII
- Your Google Workspace data

See [TELEMETRY.md](projects/helios-web/docs/TELEMETRY.md) for full details.

### How to Control Telemetry

```env
# In your .env file
HELIOS_TELEMETRY_ENABLED=false  # Default: disabled
```

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
                   │ (gridworx)  │
                   └─────────────┘
```

Your instance talks to Google Workspace using your own service account. Optionally, it can send anonymous health/usage data to helios.gridworx.io.

---

## Comparison

| Feature | Helios | BetterCloud/GAT | GAM (CLI) |
|---------|--------|-----------------|-----------|
| Data Location | Your Infrastructure | SaaS Cloud | Local Machine |
| Interface | Modern Web UI | Modern Web UI | Command Line |
| API Access | Full + Audited | Limited | Full |
| Audit Trail | Every Action Logged | Varies | Manual |
| Cost Model | Free or Fixed | $30-60/user/year | Free |
| Setup | Docker Compose | SaaS Signup | Complex Auth |

---

## Related Projects

| Project | License | Purpose |
|---------|---------|---------|
| **helios-client** (this) | MIT | Single-organization admin portal |
| [helios-mtp](https://github.com/gridworx/helios-mtp) | BSL | Multi-tenant portal for MSPs |
| helios-web | Proprietary | Marketing site & hosting portal |

---

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](docs/guides/SETUP.md) | Complete setup guide |
| [GOOGLE-WORKSPACE-SETUP-GUIDE.md](docs/GOOGLE-WORKSPACE-SETUP-GUIDE.md) | Google Workspace integration |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | UI/UX guidelines |

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

**MIT License** - Use it however you want.

See [LICENSE](LICENSE) for details.

---

## Support

- **Self-hosted:** [GitHub Discussions](https://github.com/gridworx/helios-client/discussions)
- **Hosted customers:** Chat support via your dashboard

---

## About

Built by [Gridworx](https://gridworx.io). We also offer:
- **Managed Services:** We manage your Google Workspace for you
- **helios-mtp:** Multi-tenant version for MSPs and IT providers

Contact: [info@gridworx.io](mailto:info@gridworx.io)
