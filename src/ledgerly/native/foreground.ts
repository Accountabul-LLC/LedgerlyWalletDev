/** Cancels sensitive results and re-locks operations that finish after backgrounding. */
export class ForegroundWallet {
  private generation = 0;

  constructor(
    private readonly lock: () => Promise<void>,
    private active = true,
  ) {}

  async setActive(active: boolean): Promise<void> {
    this.active = active;
    if (!active) {
      this.generation++;
      await this.lock();
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const current = () => this.active && generation === this.generation;
    return (async () => {
      if (!current()) throw new Error('Return to the app and try again.');
      try {
        const result = await operation();
        if (!current()) throw new Error('The wallet locked. Please unlock and try again.');
        return result;
      } finally {
        // An in-flight create/unlock may reopen the engine after the initial lock.
        if (!current()) await this.lock();
      }
    })();
  }
}
