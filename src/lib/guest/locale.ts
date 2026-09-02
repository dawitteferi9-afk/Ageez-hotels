/**
 * Multilingual Support Phase 1 — the tenant-level locale gate. Deliberately
 * a small, pure function (no DB/session/request access of its own) so it's
 * trivially unit-testable and has exactly one job: is this URL locale one
 * this hotel has actually turned on? `enabledLocales` must always be
 * server-resolved data (`Hotel.enabledLocales`, read via the existing
 * `getCurrentTenantHotel()` — never a client-supplied value) — `locale`
 * itself is ordinary, untrusted request context (a URL segment), not a
 * security credential; this function only ever answers a presentation
 * question ("should this locale render for this tenant"), never a tenant-
 * isolation or authorization one.
 */
export function isLocaleEnabledForHotel(locale: string, enabledLocales: readonly string[]): boolean {
  return enabledLocales.includes(locale);
}
