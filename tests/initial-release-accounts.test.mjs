import assert from 'node:assert/strict'
import test from 'node:test'

import { initialReleaseAccounts } from '../src/features/accounts/initial-release.ts'

const personal = { id: 'personal-id', accountType: 'personal', role: 'owner', displayName: 'My account' }
const group = { id: 'group-id', accountType: 'group', role: 'admin', displayName: 'Group' }

test('a group membership cannot become the active account', () => {
  assert.deepEqual(initialReleaseAccounts([group, personal], personal), [personal])
})

test('a missing membership retains the legacy personal account', () => {
  assert.deepEqual(initialReleaseAccounts([group], personal), [personal])
})

test('a non-owner or group record for the personal id fails closed', () => {
  assert.deepEqual(initialReleaseAccounts([{ ...personal, role: 'viewer' }, group], personal), [])
  assert.deepEqual(initialReleaseAccounts([{ ...group, id: personal.id }], personal), [])
})

test('a group-only user has no account in the initial release', () => {
  assert.deepEqual(initialReleaseAccounts([group], null), [])
})
