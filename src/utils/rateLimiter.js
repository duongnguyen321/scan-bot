/**
 * Sliding-window rate-limiter queue.
 *
 * Usage
 * -----
 *   const limiter = createRateLimiter(3);           // 3 calls / sec
 *   const result  = await limiter.enqueue(() => someAsyncFn());
 *
 * Behaviour
 * ---------
 * - A sliding window of `maxPerSec` calls / 1 000 ms is maintained.
 * - If the window is full, the thunk is pushed to a FIFO queue and
 *   executed as soon as a slot becomes free.
 * - No calls are ever dropped — they all resolve (or reject) eventually.
 * - Multiple independent limiters can coexist (one per chain / API key).
 */

const WINDOW_MS = 1000; // 1 second

/**
 * @param {number} maxPerSec  Maximum API calls allowed per second
 * @returns {{ enqueue: (fn: () => Promise<any>) => Promise<any> }}
 */
function createRateLimiter(maxPerSec = 3) {
  /** Timestamps (Date.now()) of in-flight / recently completed calls */
  const callLog = [];

  /** Pending thunks waiting for a slot */
  const queue = [];

  /** Whether the drain loop is currently running */
  let draining = false;

  /** Remove timestamps that have fallen outside the 1-sec window */
  function pruneCallLog() {
    const cutoff = Date.now() - WINDOW_MS;
    while (callLog.length > 0 && callLog[0] <= cutoff) {
      callLog.shift();
    }
  }

  /** How many ms until the oldest slot in the window expires */
  function msUntilNextSlot() {
    if (callLog.length < maxPerSec) return 0;
    return Math.max(0, callLog[0] + WINDOW_MS - Date.now() + 10); // +10ms buffer
  }

  async function drain() {
    if (draining) return;
    draining = true;

    while (queue.length > 0) {
      pruneCallLog();

      if (callLog.length < maxPerSec) {
        // Slot available — fire next item
        const { fn, resolve, reject } = queue.shift();
        callLog.push(Date.now());

        fn().then(resolve).catch(reject);
        // Don't await — keep draining immediately to fill remaining slots
      } else {
        // Window is full — wait until the oldest call expires
        const wait = msUntilNextSlot();
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    draining = false;
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn  Async thunk to rate-limit
   * @returns {Promise<T>}
   */
  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain(); // kick off drain (no-op if already running)
    });
  }

  return { enqueue };
}

module.exports = { createRateLimiter };
