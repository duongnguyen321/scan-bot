const fs = require('fs');
const path = require('path');

/**
 * Fast in-memory 1-1 map: txHash → { username, status }
 *
 * Rules
 * -----
 * - Map is 1-1: the FIRST user who submits a hash owns that entry forever.
 * - Status field is updated only when the tx is confirmed "done".
 * - On startup the map is hydrated from the JSON log (done entries only).
 * - JSON log only stores done entries (fast log, not a full history).
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'hash_cache.json');

/** @type {Map<string, { username: string; status: string }>} */
const hashMap = new Map();

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** Load done-entries from JSON log into memory map on startup */
function loadFromDisk() {
  try {
    ensureLogDir();
    if (!fs.existsSync(LOG_FILE)) return;
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data === 'object' && data !== null) {
      for (const [hash, entry] of Object.entries(data)) {
        hashMap.set(hash, entry);
      }
    }
    console.log(`[HashCache] Loaded ${hashMap.size} entries from disk.`);
  } catch (err) {
    console.error('[HashCache] Failed to load from disk:', err.message);
  }
}

/** Persist only done-entries to JSON log (non-blocking) */
function saveToDisk() {
  try {
    ensureLogDir();
    const doneEntries = {};
    for (const [hash, entry] of hashMap.entries()) {
      if (entry.done) {
        doneEntries[hash] = entry;
      }
    }
    fs.writeFileSync(LOG_FILE, JSON.stringify(doneEntries, null, 2), 'utf-8');
  } catch (err) {
    console.error('[HashCache] Failed to save to disk:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the FIRST sender of a hash.
 * If already registered, this is a no-op (1-1 map never overwrites).
 *
 * @param {string} hash
 * @param {string} username  - Telegram @username or first_name
 */
function registerFirst(hash, username) {
  if (!hashMap.has(hash)) {
    hashMap.set(hash, { username, done: false });
  }
}

/**
 * Mark a hash as done and persist to disk.
 * Should be called only when the transaction status contains "Thành công".
 *
 * @param {string} hash
 * @param {string} status  - Final status string from the tx data
 */
function markDone(hash, status, txData) {
  const entry = hashMap.get(hash);
  if (entry && !entry.done) {
    entry.done = true;
    entry.status = status;
    entry.txData = txData;
    saveToDisk();
  }
}

/**
 * Get the stored entry for a hash.
 *
 * @param {string} hash
 * @returns {{ username: string; done: boolean; status?: string } | undefined}
 */
function getEntry(hash) {
  return hashMap.get(hash);
}

/**
 * Return the first-sender username for a hash, or null if unknown.
 *
 * @param {string} hash
 * @returns {string | null}
 */
function getFirstUsername(hash) {
  return hashMap.get(hash)?.username ?? null;
}

// Hydrate on module load
loadFromDisk();

module.exports = { registerFirst, markDone, getEntry, getFirstUsername };
