/** Account/network scope plus request order; late replies cannot replace newer data. */
export class LatestRequest {
  private generation = 0;
  private scope = '';

  setScope(scope: string): void {
    if (this.scope !== scope) {
      this.scope = scope;
      this.invalidate();
    }
  }

  begin(): () => boolean {
    const generation = ++this.generation;
    return () => generation === this.generation;
  }

  invalidate(): void {
    this.generation++;
  }
}
