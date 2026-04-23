require('dotenv').config();
const { Telegraf } = require('telegraf');
const { handleTxMessage } = require('./handlers/txHandler');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.command('start', (ctx) => handleTxMessage(ctx));
bot.command('help', (ctx) => handleTxMessage(ctx));

// Handle all text messages
bot.on('text', (ctx) => handleTxMessage(ctx));

// Error handler
bot.catch((err, ctx) => {
  console.error(`[Bot] Error for ${ctx.updateType}:`, err.message);
});

// Start bot
bot.launch({
  allowedUpdates: ['message'],
}).then(() => {
  console.log('🚀 Donkeij Check Bill Bot is running...');
  console.log(`Bot: @${bot.botInfo?.username || 'unknown'}`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
