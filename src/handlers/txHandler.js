const { getTronTransaction } = require('../chains/tron');
const { getEvmTransaction } = require('../chains/evm');
const { parseUserInput, formatTxMessage, formatHelpMessage } = require('../utils/parser');

const EVM_NETWORKS = new Set(['ETH', 'BEP20', 'POLYGON', 'ARBITRUM']);

/**
 * Main handler for incoming Telegram messages
 * @param {import('telegraf').Context} ctx
 */
async function handleTxMessage(ctx) {
  const text = ctx.message?.text;
  if (!text) return;

  // Help command
  if (text.startsWith('/start') || text.startsWith('/help')) {
    return ctx.replyWithMarkdown(formatHelpMessage());
  }

  const parsed = parseUserInput(text);

  if (!parsed) {
    return ctx.replyWithMarkdown(
      '⚠️ *Không nhận dạng được giao dịch*\n\nGửi /help để xem hướng dẫn.'
    );
  }

  const { network, txHash } = parsed;

  // Send loading message
  const loadingMsg = await ctx.reply('🔍 Đang kiểm tra giao dịch...');

  try {
    let txData = null;

    if (network === 'TRC20') {
      txData = await getTronTransaction(txHash);
    } else if (EVM_NETWORKS.has(network)) {
      txData = await getEvmTransaction(txHash, network);
    } else {
      // Try all EVM chains in order, then TRC20
      const evmNetworks = ['ETH', 'BEP20', 'POLYGON', 'ARBITRUM'];
      for (const net of evmNetworks) {
        txData = await getEvmTransaction(txHash, net);
        if (txData) break;
      }
      if (!txData) {
        txData = await getTronTransaction(txHash);
      }
    }

    // Delete loading message
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    const message = formatTxMessage(txData);
    await ctx.replyWithMarkdown(message, {
      disable_web_page_preview: true,
    });
  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    console.error('[Handler] Error:', err.message);
    await ctx.reply('❌ Lỗi server. Vui lòng thử lại sau.');
  }
}

module.exports = { handleTxMessage };
