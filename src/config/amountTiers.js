/**
 * Amount-based message tier config.
 *
 * Tiers are evaluated in order — the first matching range wins.
 * `to` is inclusive. Use Infinity for an open-ended upper bound.
 *
 * Available placeholders inside template strings:
 *   {status}     — e.g. "✅ Thành công"
 *   {amount}     — e.g. "500.00"
 *   {token}      — e.g. "USDT"
 *   {network}    — e.g. "TRC20"
 *   {from}       — short sender address
 *   {to}         — short receiver address
 *   {toLabel}    — optional label for receiver (empty string if none)
 *   {timestamp}  — e.g. "2024-03-15 09:41:00"
 *   {fee}        — e.g. "0.000100 TRX"
 *   {block}      — block number or "N/A"
 *   {hash}       — short tx hash
 *   {explorerUrl}— full explorer URL
 */

/* ── Rule: nhãn field phải nhất quán xuyên suốt tất cả các tier ────────────
   Chỉ header/tagline được thay đổi theo mức tiền để tạo hiệu ứng ngộ nghĩnh.
   Người đọc sẽ quét mắt nhanh hơn vì luôn thấy đúng layout quen thuộc.
   ───────────────────────────────────────────────────────────────────────── */

const FIELD_ROW = {
  network:   (v)    => `Network   : \`${v}\``,
  token:     (v)    => `Token     : *${v}*`,
  amount:    (a, t) => `Số tiền   : *${a} ${t}*`,
  from:      (v)    => `Từ ví     : \`${v}\``,
  to:        (v, l) => `Đến ví    : \`${v}\`${l}`,
  time:      (v)    => `Thời gian : ${v}`,
  fee:       (v)    => `Phí       : ${v}`,
  block:     (v)    => `Block     : ${v}`,
  hash:      (v)    => `Hash      : \`${v}\``,
};

function buildRows(vars) {
  return [
    FIELD_ROW.network(vars.network),
    FIELD_ROW.token(vars.token),
    FIELD_ROW.amount(vars.amount, vars.token),
    FIELD_ROW.from(vars.from),
    FIELD_ROW.to(vars.to, vars.toLabel),
    FIELD_ROW.time(vars.timestamp),
    FIELD_ROW.fee(vars.fee),
    FIELD_ROW.block(vars.block),
    FIELD_ROW.hash(vars.hash),
  ].join('\n');
}

const AMOUNT_TIERS = [
  {
    from: 0,
    to: 9.99,
    tagline: '🤏 Đủ tiền uống ly trà đá thui!',
    link: 'Tra mã vận đơn',
  },
  {
    from: 10,
    to: 99.99,
    tagline: '🍔 Lương về, làm bát phở full topping đê!',
    link: 'Soi bill trên trình duyệt',
  },
  {
    from: 100,
    to: 499.99,
    tagline: '😎 Có tiền đi quẩy cuối tuần rồi ae ơi!',
    link: 'Check var hệ thống',
  },
  {
    from: 500,
    to: 999.99,
    tagline: '🔥 Gáy lên ae, cá mập con xuất hiện!',
    link: 'Khám xét tại đây',
  },
  {
    from: 1000,
    to: 9999.99,
    tagline: '🐳 CÁ MẬP VÀO BỜ! BÚ ĐẬM VCL!',
    link: 'Soi ví cá mập',
  },
  {
    from: 10000,
    to: Infinity,
    tagline: '🚨 [BÁO ĐỘNG] ĐẠI GIA NGHÌN ĐÔ ĐÁP CÁNH [!!!] 🚨\n👑 Xin hãy nhận của tiểu đệ một lạy!',
    link: 'Chiêm ngưỡng sự giàu sang',
  },
];

/**
 * Render a tier message. Called from formatTxMessage in parser.js.
 * @param {object} tier
 * @param {object} vars  — same shape as applyTemplate vars
 * @returns {string}
 */
function renderTier(tier, vars) {
  return (
    `${vars.status}\n\n` +
    `*${tier.tagline}*\n` +
    `${'─'.repeat(28)}\n` +
    `${buildRows(vars)}\n` +
    `${'─'.repeat(28)}\n` +
    `[🔍 ${tier.link}](${vars.explorerUrl})`
  );
}

module.exports = { AMOUNT_TIERS, renderTier };
