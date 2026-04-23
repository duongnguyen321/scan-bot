const { getTronTransaction } = require('../chains/tron');
const { getEvmTransaction } = require('../chains/evm');
const { parseUserInput, formatTxMessage, formatHelpMessage } = require('../utils/parser');

const EVM_NETWORKS = new Set(['ETH', 'BEP20', 'POLYGON', 'ARBITRUM']);

/** True when ctx is from a group or supergroup */
function isGroupChat(ctx) {
  const type = ctx.chat?.type;
  return type === 'group' || type === 'supergroup';
}

/**
 * Reply helper — in group chats always quote the triggering message so the
 * reply is threaded to the right user.
 */
async function smartReply(ctx, message, options = {}) {
  if (isGroupChat(ctx)) {
    return ctx.replyWithMarkdown(message, {
      reply_to_message_id: ctx.message.message_id,
      disable_web_page_preview: true,
      ...options,
    });
  }
  return ctx.replyWithMarkdown(message, {
    disable_web_page_preview: true,
    ...options,
  });
}

/**
 * Main handler for incoming Telegram messages (private + group)
 * @param {import('telegraf').Context} ctx
 */
async function handleTxMessage(ctx) {
  const text = ctx.message?.text;
  if (!text) return;

  // Help / start commands — reply in all chat types
  if (text.startsWith('/start') || text.startsWith('/help')) {
    return smartReply(ctx, formatHelpMessage());
  }

  const parsed = parseUserInput(text);

  if (!parsed) {
    // In groups: stay silent to avoid spamming every non-hash message
    if (isGroupChat(ctx)) return;
    return ctx.replyWithMarkdown(
      '⚠️ *Không nhận dạng được giao dịch*\n\nGửi /help để xem hướng dẫn.'
    );
  }

  const { network, txHash } = parsed;

  // Send loading indicator (reply-style in groups)
  const loadingMsg = isGroupChat(ctx)
    ? await ctx.reply('Đang kiểm tra giao dịch...', {
        reply_to_message_id: ctx.message.message_id,
      })
    : await ctx.reply('Đang kiểm tra giao dịch...');

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

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    const message = formatTxMessage(txData);
    await smartReply(ctx, message);
  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    console.error('[Handler] Error:', err.message);
    const errMsg = 'Bot đang ăn cơm, đợi xíu thử lại sau';
    isGroupChat(ctx)
      ? await ctx.reply(errMsg, { reply_to_message_id: ctx.message.message_id })
      : await ctx.reply(errMsg);
  }
}

module.exports = { handleTxMessage };
