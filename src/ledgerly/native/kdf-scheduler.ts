// Preserve noble's helpers and change only native asynchronous scheduling.
export * from '@noble/hashes/utils.js';

/** Let React Native render and process input between Argon2 work slices. */
let lastTimerYield = 0;
export const nextTick = (): Promise<void> =>
  new Promise((resolve) => {
    // RN's setImmediate is a microtask shim, so it cannot alone yield to input.
    // Bound actual event-loop work to 32 ms; use immediates between those yields
    // to avoid Windows' >8 ms timers forcing noble to yield on every block.
    const elapsed = Date.now() - lastTimerYield;
    if (typeof setImmediate === 'function' && elapsed >= 0 && elapsed < 32) setImmediate(resolve);
    else
      setTimeout(() => {
        lastTimerYield = Date.now();
        resolve();
      }, 0);
  });
