# Secure the API Relay with an Authorization Model

## Summary

Helios's transparent API relay (`middleware/transparent-proxy.ts` for Google,
`microsoft-transparent-proxy.ts` for Microsoft) forwards a caller's request to the
underlying cloud admin API and audits it. Today it **authorizes nothing**: any
authenticated caller can reach any endpoint the underlying credentials permit, by
guessing the path. This proposal adds a deny-by-default authorization layer —
scoped, auditable, discoverable, and shipped dark — that turns the relay from a
liability into the product's central differentiator.

**The relay is not yet shipped or deployed, so there is no live exposure.** This
is pre-release design work. The relay MUST NOT ship without this model.

## Problem Statement

The relay's value proposition is real and unusual: *"features Helios hasn't built
a UI for still work for those who know the API."* A user can query or manage a
Workspace resource Helios has no page for, and every call is audited. That is
genuinely differentiated.

But the same sentence is the security hole. As built:

1. **No endpoint authorization.** The relay forwards any path to
   `https://admin.googleapis.com/${path}`. A caller permitted to *read* users can
   *delete* them by calling the raw endpoint — and it will be logged, but logged
   is not prevented.
2. **The OAuth-scope ceiling is not real.** The Google JWT is minted with **all**
   directory scopes hardcoded (`admin.directory.user/group/orgunit/domain`) on
   every call, regardless of what the call does (transparent-proxy.ts ~336-339).
   So even the underlying-credential ceiling grants everything.
3. **No separation of read from write from delete.** A `GET` and a `DELETE` are
   treated identically.
4. **Batch and impersonation are unconstrained.** Google's batch API wraps many
   sub-requests in one HTTP call; authorizing the outer call authorizes all of
   them. Domain-wide delegation takes the impersonated subject as a parameter, so
   a "read users" grant can target the super-admin.

This is the same class of gap the sibling product (Aegis) closed in its audit
(C4: confining pairing keys to a route prefix; M4: an admin-key permission
ceiling). The relay needs the equivalent.

## Goals

- Deny by default. An install starts with the relay able to do **nothing** until
  an admin grants capabilities.
- Preserve the "unbuilt features still work" value for **reads**, which is where
  nearly all of that value lives — without preserving it for destructive writes.
- Make the allowlist **discoverable from real usage**, not guessed up front.
- Enforce two hard ceilings the relay can only narrow, never widen: the caller's
  Helios role, and the OAuth scopes actually minted.
- Audit every decision — allows and denies alike.
- Ship dark: feature-flagged, off by default, per-organization opt-in, writes
  disabled even when on.
- Cover Google and Microsoft with a **shared policy engine** but **cloud-specific
  rule vocabularies** — the two clouds' admin semantics diverge and a single
  leaky abstraction would be worse than two clean ones.

## Non-Goals

- Shipping the relay itself (this secures it; enabling it is a later decision).
- Re-implementing Google/Microsoft admin features in Helios.
- A general-purpose API gateway. This is scoped to the admin-relay use case.

## Why now

The relay is unshipped, so the authorization model can be designed correctly the
first time with no backward-compatibility constraint. Once it ships and any
install enables it, the rule vocabulary and audit shape become a contract. This
is the cheap moment.
