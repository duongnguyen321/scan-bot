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
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format transaction result into a Telegram message.
 *
 * @param {object|null} tx  - Normalised tx object returned by chain adapters
 * @returns {string}
 */
function formatTxMessage(tx, firstFrom = null) {
  if (!tx) {
    return '❌ *Không tìm thấy giao dịch*\nVui lòng kiểm tra lại hash hoặc network.';
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

  let statusDisplay = tx.status;

  if (tx.status.includes('Thành công')) {
    const numericAmount = parseFloat(tx.amount) || 0;
    if (numericAmount < 1000) {
      statusDisplay += '\n\n> 🥲 *YẾU QUÁ PHẢI CỐ GẮNG THÊM*';
    } else if (numericAmount < 5000) {
      statusDisplay += '\n\n> 🍻 *TỀNH TÀNG THẾ THÔI*';
    } else {
      statusDisplay += "\n\n> 🎉 *CHÚC ĐẠI GIA NGÀY MỚI 8386 * 🚀";
    }
  }

  return (
    `${statusDisplay}\n\n` +
    `🔗 Network: ${tx.network}\n` +
    `🪙 Token: ${tx.token}\n` +
    `💰 Số tiền: ${tx.amount} ${tx.token}\n` +
    `👤 Từ ví: \`${shortFrom}\`\n` +
    `💼 Đến ví: \`${shortTo}\`${tx.toLabel ? ` (${tx.toLabel})` : ''}\n` +
    `🕐 Thời gian: ${tx.timestamp}\n` +
    `⛽ Phí: ${tx.fee}\n` +
    // `📦 Block: ${tx.block || 'N/A'}\n` +  // kept for future use
    `#️⃣ Hash: \`${shortHash}\`\n\n` +
    `*👤 Người gửi đầu tiên: \`${firstFrom || 'N/A'}\`*\n\n` +
    `🔍 [Xem trên Explorer](${tx.explorerUrl})`
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

module.exports = { parseUserInput, formatTxMessage, formatHelpMessage };
