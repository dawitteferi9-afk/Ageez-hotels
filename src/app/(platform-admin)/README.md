# Platform Admin Route Group (RESERVED — OUT OF SCOPE FOR v0.1)

Reserved boundary for the future Ageez platform-level administration system:
creating hotel tenants, configuring hotels, enabling modules, tenant
administration, platform operations.

This audience is architecturally distinct from a single hotel's own
OWNER/ADMIN role — a hotel admin manages their hotel; a platform admin
manages the Ageez Hotels product across all tenants. Keeping this route
group empty (but present) now prevents the two concepts from being
conflated later when the Hotel Generator is built.

Do not implement anything here during v0.1.
