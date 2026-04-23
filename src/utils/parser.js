/**
 * Parse user message to extract network and txHash
 * Supports formats:
 *   - "TRC20 <hash>"
 *   - "ETH <hash>"
 *   - "BEP20 <hash>"
 *   - "USDT TRC20 <hash>"
 *   - "<hash>" (auto-detect)
 */
function parseUserInput(text) {
  if (!text) return null;

  const clean = text.trim().replace(/\n/g, ' ');

  // TX hash patterns
  // TRON: 64 hex chars
  // EVM: 0x + 64 hex chars
  const evmHashPattern = /0x[a-fA-F0-9]{64}/;
  const tronHashPattern = /\b[a-fA-F0-9]{64}\b/;

  // Network keywords map
  const networkAliases = {
    TRC20: 'TRC20',
    TRON: 'TRC20',
    TRX: 'TRC20',
    TRONSCAN: 'TRC20',
    ETH: 'ETH',
    ERC20: 'ETH',
    ETHEREUM: 'ETH',
    ETHERSCAN: 'ETH',
    BEP20: 'BEP20',
    BSC: 'BEP20',
    BNB: 'BEP20',
    BSCSCAN: 'BEP20',
    POLYGON: 'POLYGON',
    MATIC: 'POLYGON',
    ARB: 'ARBITRUM',
    ARBITRUM: 'ARBITRUM',
  };

  const upperText = clean.toUpperCase();

  // Detect network from keywords
  let detectedNetwork = null;
  for (const [key, value] of Object.entries(networkAliases)) {
    if (upperText.includes(key)) {
      detectedNetwork = value;
      break;
    }
  }

  // Detect hash
  let txHash = null;
  const evmMatch = clean.match(evmHashPattern);
  const tronMatch = clean.match(tronHashPattern);

  if (evmMatch) {
    txHash = evmMatch[0];
    // If no network specified and hash is EVM format, default to ETH
    if (!detectedNetwork) detectedNetwork = 'ETH';
  } else if (tronMatch) {
    txHash = tronMatch[0];
    if (!detectedNetwork) detectedNetwork = 'TRC20';
  }

  if (!txHash) return null;

  return { network: detectedNetwork, txHash };
}

// ---------------------------------------------------------------------------
// Amount-tier helpers
// ---------------------------------------------------------------------------

/**
 * Find the first tier whose [from, to] range contains the given amount.
 * @param {number} amount
 * @param {Array<{from:number, to:number, template:string}>} tiers
 * @returns {{from:number, to:number, template:string}|null}
 */
function getAmountTier(amount, tiers) {
  if (!Array.isArray(tiers)) return null;
  for (const tier of tiers) {
    if (amount >= tier.from && amount <= tier.to) {
      return tier;
    }
  }
  return null;
}

/**
 * Replace all {placeholder} tokens in a template string.
 * @param {string} template
 * @param {Record<string, string>} vars
 * @returns {string}
 */
function applyTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{${key}}`
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format transaction result into a Telegram message.
 *
 * @param {object|null} tx  - Normalised tx object returned by chain adapters
 * @param {Array<{from:number, to:number, template:string}>} [tiers] - Optional amount tiers
 * @returns {string}
 */
function formatTxMessage(tx, tiers, renderTierFn) {
  if (!tx) {
    return '[!] *Không tìm thấy giao dịch*\nVui lòng kiểm tra lại hash hoặc network.';
  }

  const shortHash = tx.hash.length > 20
    ? tx.hash.substring(0, 10) + '...' + tx.hash.substring(tx.hash.length - 10)
    : tx.hash;

  const shortFrom = tx.from
    ? tx.from.substring(0, 8) + '...' + tx.from.substring(tx.from.length - 8)
    : 'N/A';

  const shortTo = tx.to
    ? tx.to.substring(0, 8) + '...' + tx.to.substring(tx.to.length - 8)
    : 'N/A';

  const numericAmount = parseFloat(tx.amount) || 0;
  const tier = getAmountTier(numericAmount, tiers);

  if (tier && typeof renderTierFn === 'function') {
    const vars = {
      status:      tx.status,
      amount:      tx.amount,
      token:       tx.token,
      network:     tx.network,
      from:        shortFrom,
      to:          shortTo,
      toLabel:     tx.toLabel ? ` _(${tx.toLabel})_` : '',
      timestamp:   tx.timestamp,
      fee:         tx.fee,
      block:       tx.block || 'N/A',
      hash:        shortHash,
      explorerUrl: tx.explorerUrl,
    };
    return renderTierFn(tier, vars);
  }

  // Default layout (no tier matched)
  return (
    `${tx.status}\n\n` +
    `- *Network:* \`${tx.network}\`\n` +
    `- *Token:* *${tx.token}*\n` +
    `- *Số tiền:* *${tx.amount} ${tx.token}*\n` +
    `- *Từ ví:* \`${shortFrom}\`\n` +
    `- *Đến ví:* \`${shortTo}\`${tx.toLabel ? ` _(${tx.toLabel})_` : ''}\n` +
    `- *Thời gian:* ${tx.timestamp}\n` +
    `- *Phí:* ${tx.fee}\n` +
    `- *Block:* ${tx.block || 'N/A'}\n` +
    `- *Hash:* \`${shortHash}\`\n\n` +
    `[Xem trên Explorer](${tx.explorerUrl})`
  );
}

/**
 * Format error / help message
 */
function formatHelpMessage() {
  return (
    `[Donkeij Check Bill Bot](https://duonguyen.site)\n\n` +
    `Gửi *network + transaction hash* để kiểm tra giao dịch:\n\n` +
    `*Các network hỗ trợ:*\n` +
    `• \`TRC20\` / \`TRON\` — Tronscan\n` +
    `• \`ETH\` / \`ERC20\` — Ethereum\n` +
    `• \`BEP20\` / \`BSC\` / \`BNB\` — BNB Chain\n` +
    `• \`POLYGON\` / \`MATIC\` — Polygon\n` +
    `• \`ARBITRUM\` / \`ARB\` — Arbitrum\n\n` +
    `*Cách dùng:*\n` +
    `\`TRC20 <txhash>\`\n` +
    `\`ETH <0xtxhash>\`\n` +
    `\`USDT TRC20 <txhash>\`\n` +
    `\`BEP20 0x...\`\n\n` +
    `_Nếu không ghi network, bot sẽ tự detect từ định dạng hash_`
  );
}

module.exports = { parseUserInput, formatTxMessage, formatHelpMessage, getAmountTier };
