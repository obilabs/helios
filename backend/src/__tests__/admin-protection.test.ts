/**
 * Regression tests for the Google Workspace self-lockout guard.
 *
 * The invariant: Helios must never suspend/delete/offboard the Google Workspace
 * admin it impersonates (gw_credentials.admin_email) — doing so severs its own
 * auth and can lock the operator out. This is the one destructive flow the
 * readiness review said must carry a permanent regression, because a silent
 * break here = a real admin account destroyed.
 */

import { jest, describe, it, expect } from '@jest/globals'
import {
  assertNotProtectedAdmin,
  ProtectedAdminError,
  type DirectoryUserLookup,
} from '../services/admin-protection.js'

const ADMIN = 'it-admin@acme.com'

/** A fake Directory client whose users.get resolves an id → user, or throws. */
function fakeAdmin(
  usersById: Record<string, { primaryEmail?: string; isAdmin?: boolean }> = {},
  opts: { throwOnGet?: boolean } = {},
): DirectoryUserLookup {
  return {
    users: {
      get: jest.fn(async (params: { userKey: string }) => {
        if (opts.throwOnGet) throw new Error('backend error (lookup failed)')
        const u = usersById[params.userKey]
        if (!u) throw new Error('Resource Not Found: userKey')
        return { data: u }
      }) as any,
    },
  }
}

describe('assertNotProtectedAdmin — Google Workspace self-lockout guard', () => {
  it('refuses a destructive action targeting the admin by email (case-insensitive, no lookup)', async () => {
    const admin = fakeAdmin()
    await expect(
      assertNotProtectedAdmin(admin, 'IT-Admin@ACME.com', ADMIN, 'suspend'),
    ).rejects.toBeInstanceOf(ProtectedAdminError)
    expect(admin.users.get).not.toHaveBeenCalled() // already an email → no API call
  })

  it('refuses when a Google user id resolves to the admin email', async () => {
    const admin = fakeAdmin({ '12345': { primaryEmail: ADMIN, isAdmin: true } })
    await expect(
      assertNotProtectedAdmin(admin, '12345', ADMIN, 'delete'),
    ).rejects.toBeInstanceOf(ProtectedAdminError)
    expect(admin.users.get).toHaveBeenCalledWith(
      expect.objectContaining({ userKey: '12345' }),
    )
  })

  it('allows a destructive action on a normal user (by email)', async () => {
    await expect(
      assertNotProtectedAdmin(fakeAdmin(), 'bob@acme.com', ADMIN, 'suspend'),
    ).resolves.toBeUndefined()
  })

  it('allows a destructive action on a normal user (id resolves to a different email)', async () => {
    const admin = fakeAdmin({ '999': { primaryEmail: 'bob@acme.com' } })
    await expect(
      assertNotProtectedAdmin(admin, '999', ADMIN, 'offboard'),
    ).resolves.toBeUndefined()
  })

  it('FAILS SAFE: refuses when the id lookup throws (cannot prove target is not the admin)', async () => {
    const admin = fakeAdmin({}, { throwOnGet: true })
    await expect(
      assertNotProtectedAdmin(admin, '777', ADMIN, 'offboard'),
    ).rejects.toBeInstanceOf(ProtectedAdminError)
  })

  it('is a no-op when no admin email is configured (nothing to protect)', async () => {
    const admin = fakeAdmin()
    await expect(assertNotProtectedAdmin(admin, 'anyone@acme.com', '', 'delete')).resolves.toBeUndefined()
    await expect(
      assertNotProtectedAdmin(admin, 'anyone@acme.com', undefined, 'delete'),
    ).resolves.toBeUndefined()
    expect(admin.users.get).not.toHaveBeenCalled()
  })

  it('with no directory client, still refuses the admin passed by email', async () => {
    await expect(
      assertNotProtectedAdmin(null, ADMIN, ADMIN, 'offboard'),
    ).rejects.toBeInstanceOf(ProtectedAdminError)
  })

  it('with no directory client, allows a normal user passed by email', async () => {
    await expect(
      assertNotProtectedAdmin(null, 'bob@acme.com', ADMIN, 'offboard'),
    ).resolves.toBeUndefined()
  })

  it('with no directory client and a bare id, fails safe (cannot resolve)', async () => {
    await expect(
      assertNotProtectedAdmin(null, '12345', ADMIN, 'offboard'),
    ).rejects.toBeInstanceOf(ProtectedAdminError)
  })

  it('produces a ProtectedAdminError that names the action and account', async () => {
    let err: any
    try {
      await assertNotProtectedAdmin(fakeAdmin(), ADMIN, ADMIN, 'suspend')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ProtectedAdminError)
    expect((err as ProtectedAdminError).code).toBe('PROTECTED_ADMIN')
    expect(err.message).toMatch(/suspend/i)
    expect(err.message).toContain(ADMIN)
  })
})
