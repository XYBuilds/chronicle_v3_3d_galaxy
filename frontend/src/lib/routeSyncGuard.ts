/** Phase 30 — shared guard for URL↔store sync (R7/R8). */
export const routeSyncGuard = {
  /** `history` mutation in flight (replace/push). */
  active: false,
  /** `popstate` handler applying URL → store; blocks store → URL push. */
  isPopstate: false,
  /** URL → store apply (boot, popstate, R2); blocks store → URL. */
  suppressStoreToUrl: false,
  lastAppliedPath: null as string | null,
}
