---
name: Super-admin 2FA enforcement
description: Why/how 2FA is mandatory for all super admins, not just new ones, in the command hub
---

Super-admin 2FA is **mandatory for every super admin**, not just freshly created ones. A router-level gate after the `/auth/*` routes blocks all sensitive super-admin endpoints when the admin's `totpEnabled` is false, returning 403 with `error: "2FA_SETUP_REQUIRED"`. The `/auth/*` routes (login, verify-2fa, setup-2fa, confirm-2fa, disable-2fa, me, bootstrap-status, register, emergency-reset) stay exempt so an un-enrolled admin can still authenticate and enroll. The frontend dashboard renders a full-screen mandatory enrollment screen (reusing setup-2fa/confirm-2fa) whenever the logged-in admin lacks 2FA, and disables data queries until enrolled so they don't 403-then-logout.

**Why:** the command hub controls every facility; optional 2FA was a security gap. Enforcing globally (vs. only new accounts) is the safer default and satisfies the "block accounts without it from sensitive actions" requirement.

**How to apply:** any new sensitive super-admin route must be defined AFTER the `router.use(requireEnrolled2FA)` gate. Routes that must work pre-enrollment (anything an un-enrolled admin needs) must be defined BEFORE the gate, alongside the `/auth/*` routes. Existing admins with `totpEnabled=false` will be forced to enroll on next login.
