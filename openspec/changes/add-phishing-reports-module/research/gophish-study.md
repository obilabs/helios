<!-- Phase 0: GoPhish source study (read-only reference, MIT). Fable agent, 2026-09-03. Feeds the schema freeze. -->

# GoPhish → Helios Phishing-Sim Module: ADOPT / IMPROVE / AVOID

Study of `gophish` source (models + `controllers/phish.go`, `controllers/route.go`, `controllers/api/import.go`, `webhook/webhook.go`). GoPhish's lifecycle: `Campaign` → copies `Group.Targets` into per-recipient `Result` rows → worker sends via SMTP → the phishing server records `open`/`click`/`submit`/`report` by mutating `Result.Status` and appending to an `events` timeline → webhooks fire per event. Below: what to take, where we're deliberately better, and the traps — with the data-model items to freeze now called out.

---

## 1. ADOPT

**Result = per-recipient projection; Event = the timeline. Keep both, but invert which is authoritative.** GoPhish already has the two-layer shape (`Event` table `campaign.go:76` written by `Result.createEvent` `result.go:41`, plus a per-recipient `Result` carrying a derived `Status` `result.go:26`). Adopt the split — but make the **immutable event stream the source of truth** and the per-recipient verdict a pure projection. Their `Event` → our append-only event stream; their `Result.Status` → our versioned derived-verdict row.

**Monotonic no-downgrade ladder.** `HandleEmailOpened`/`HandleClickedLink` refuse to overwrite a stronger status (`result.go:101,118`). Correct rule: a later weaker signal must not demote a stronger one. We get it free by deriving the verdict as `max` over the event stream, but encode the ordering (`sent < opened < clicked < submitted`) explicitly.

**`Reported` is ORTHOGONAL to the ladder.** The best modeling call in the code: "reported the phish" is a separate `Result.Reported bool` (`result.go:36`), not a rung. Generalize it: **report / open / click / submit / human-verdict are independent facts**, not values of one enum.

**Template context object.** `PhishingTemplateContext` (`template_context.go:20`) is a small typed variable surface; `NewPhishingTemplateContext` mints the link/pixel centrally; `ValidateTemplate` renders every template against a dummy recipient **on save** to catch bad syntax before a campaign runs. Adopt: one typed context, central link minting (ours yields `/c/<token>`), save-time validation.

**Group dedup + diff-on-update.** `Target` deduped by email (`group.go:322`); `PutGroup` diffs add/update/remove rather than drop-and-recreate (`group.go:224`). Adopt for any manual list (our primary source is the live directory).

**Webhook envelope (not its delivery).** HMAC-SHA256 over the raw body, header `X-Gophish-Signature: sha256=<hex>`, 10s timeout, redirects disabled (`webhook.go:98,115,48`). Adopt the signed-event shape for outbound/SIEM; emit one webhook per appended event so the external view is itself an event stream.

**Admin bootstrapped once, then granted.** Admin created only when `userCount == 0` (`models.go:209`), then role-granted (`rbac.go`). Matches the ObiLabs non-negotiable — don't regress.

**Denormalized recipient snapshot on the result.** `Result` embeds `BaseRecipient` inline (`result.go:38`) so it stays meaningful after the group changes/deletes. Adopt: **snapshot recipient identity onto the event/verdict at capture time** so later directory changes never rewrite history.

---

## 2. IMPROVE (where we diverge, and why)

**Opaque per-(campaign,recipient) token in the URL path vs GoPhish's global `?rid=`.** GoPhish's `rid` is a 7-char alphanumeric in a **query param** (`RecipientParameter="rid"`, `campaign.go:130`), **global** not campaign-scoped (`GetResult(rid)` derives campaign+user from the row, `phish.go:348`). It's strippable/greppable, enumerable (forces collision-check loops, `result.go:188`), and referrer-leaking. Our **opaque token in `/c/<token>`** is path-native, scoped to one (campaign,recipient), non-enumerable — kills GoPhish's biggest fingerprint.

**Human-verdict promotion vs GoPhish treating a bare GET as failure.** In `PhishHandler` (`phish.go:248`) a plain GET → "Clicked Link" immediately; no distinction between a human and a mail-scanner/AV prefetch. GoPhish has **no** passive fingerprint or second-interaction gate. We make a bare click **provisional**, promoted to a "human" verdict on passive fingerprint + JS/submit second interaction — exactly the defense against Workspace link scanning inflating clicks. (GoPhish even leaks itself via `X-Mailer`/`X-Gophish-Contact` headers + a `/robots.txt` deny, `phish.go:212,297`; injection sends nothing scannable.)

**Gmail-API injection vs SMTP + sending-profile + allowlisting.** GoPhish's send path is entirely SMTP: per-campaign `SMTP` profile (`campaign.go:32`), `MailLog` with 8-attempt exponential backoff (`maillog.go:63`), MIME build (`maillog.go:171`). Injection via `users.messages.insert` skips all of it — no profile, no spam filter, no allowlisting, no MailLog backoff. **Do NOT port `SMTP`, `MailLog`, or `StatusRetry`/`StatusSending`/`StatusScheduled`** — they're SMTP artifacts.

**Never store credential values; GoPhish stores plaintext passwords** (see AVOID). Record only THAT a submit happened + which fields were populated.

**Directory-native, org-wide vs per-user siloed static lists.** GoPhish groups are static per-user CSV snapshots (`api/import.go:41`) owned by one `user_id`, no org concept, recipients frozen into results at creation. We drive recipients from the **live Google directory**, org-wide, served from the org's own `sim.` instance (no shared tracking domain).

**Additive event schema vs mutable status string.** GoPhish overwrites `Result.Status` in place and hard-deletes on campaign delete (`campaign.go:613`). Our append-only immutable stream + versioned verdict + text event types + jsonb gives zero-breaking-migration evolution + a real audit trail.

---

## 3. AVOID (with file evidence)

**A. Storing submitted credentials — including plaintext passwords — in the event log.** The headline. `Page.CaptureCredentials`/`CapturePasswords` (`page.go:18-19`); on save, `parseHTML` (`page.go:29`) sets `action=""` and, when CapturePasswords is true, **keeps the `name` on password inputs** (`page.go:53-57`) so the browser submits them. On submit, `setupContext` puts the entire POST body into the event: `Payload: r.Form` (`phish.go:370`), marshaled into `Event.Details` JSON (`result.go:128,41`). Net: **usernames AND passwords land in the `events` table in cleartext, persisted indefinitely.** We must NEVER do this — record which fields were populated, never the values; enforce with a failing test asserting no submitted value ever reaches storage.

**B. `?rid=` query-param fingerprint + global result IDs** (`campaign.go:130`, `result.go:173`). Strippable, enumerable, referrer-leaking, screams "phishing tracker." Our in-path opaque per-recipient token exists to avoid this — don't reintroduce a query-string tracker for "compatibility."

**C. SMTP / sending-profile / allowlisting subsystem** (`maillog.go` locking, backoff, `Processing` flags, `UnlockAllMailLogs` on boot, Message-ID gen). All SMTP scaffolding; injection makes it dead weight. Don't port it.

**D. Single-owner, no-org assumption.** Every object is `WHERE user_id=?`; no org/tenant; the only "sharing" is admin `Impersonate` (`route.go:338`); `rbac.go:14` defers teams to "the future." A security team can't co-own a program. Our model must be **org-scoped** with role-granted access, not a single creator row.

**E. Schema rigidity — the items to FREEZE correctly NOW:**

1. **Decouple stored event type from display label.** GoPhish uses free-text `"Clicked Link"` as storage value, UI label AND stats query key at once (`models.go:48`; `getCampaignStats` does `WHERE status="Clicked Link"`, `campaign.go:278`). Renaming breaks history + every aggregate. **Freeze our `event_type` as stable machine tokens** (`mail.injected`, `link.click`, `interaction.human`, `form.submit`, `mail.reported`) with display labels resolved separately. Most important lesson for our text-event-type column.
2. **Event stream authoritative; no funnel backfill.** GoPhish stores only the latest status, so it fakes the funnel (submit implies click implies open implies sent, summed with running backfill, `campaign.go:286`) — and status/timeline can diverge. Deriving every stat from the immutable event stream removes the backfill and keeps projection ≡ log by construction. Events = truth; verdict = cache.
3. **Version the derived verdict.** GoPhish overwrites `Result.Status` with no history of "what did we conclude, when." Key our verdict table by (campaign, recipient, **version**) from day one so a re-derivation (new fingerprint logic) doesn't destroy the prior conclusion.
4. **Discipline the jsonb escape hatch.** `Event.Details string` (`campaign.go:82`) is an unversioned schemaless stringified-JSON blob. Ours = jsonb + a **text event-type discriminator + a schema/version field**, frozen, so payload shapes evolve additively without ambiguity.
5. **Orthogonal signals as separate facts, not enum rungs.** GoPhish got this right only for `Reported`. Freeze open/click/submit/report/human-verdict as independent append events + independent projection fields.
6. **Don't design around hard deletes.** `DeleteCampaign` hard-deletes results/events/maillogs (`campaign.go:613`). Ours = tombstone/retention, never physical row loss, so the audit trail survives.

---

**Bottom line for the freeze:** GoPhish accidentally has our architecture in miniature (events timeline + per-recipient projection + jsonb-ish details + a report bool split out of the status ladder), but made the projection authoritative, coupled storage tokens to display strings, left the details blob unversioned, and kept everything single-user + mutable. Freeze the inverse: stable machine event-type tokens decoupled from labels, event stream as source of truth (no backfill), versioned verdict projection, discriminated+versioned jsonb, orthogonal signal facts, org-scoped ownership, and no path that stores a submitted value.
