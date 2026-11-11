/**
 * Anti-spam bookkeeping for the driver buttons (pure, unit-tested in cooldown.test.ts).
 *
 *   const cd = new Cooldowns();
 *   cd.left('me:slow', now, 60_000)   → ms until allowed again (0 = allowed)
 *   cd.use('me:slow', now)            → record a use
 *   cd.accept('maria:slow', now, 60_000) → for INCOMING messages: true the first time, false for
 *                                       repeats inside the cooldown (so a spammer is ignored)
 */
export class Cooldowns {
  private last = new Map<string, number>();

  left(key: string, now: number, cooldownMs: number): number {
    const t = this.last.get(key);
    return t == null ? 0 : Math.max(0, t + cooldownMs - now);
  }

  use(key: string, now: number) {
    this.last.set(key, now);
  }

  accept(key: string, now: number, cooldownMs: number): boolean {
    if (this.left(key, now, cooldownMs) > 0) return false;
    this.use(key, now);
    return true;
  }
}
