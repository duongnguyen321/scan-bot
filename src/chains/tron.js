const axios = require('axios');

// Primary: official Tronscan API. Fallback: apilist mirror
const BASE_URL = 'https://apilist.tronscan.org/api';

function getTronscanHeaders() {
  const headers = { 'Accept': 'application/json' };
  if (process.env.TRONSCAN_API_KEY) {
    headers['TRON-PRO-API-KEY'] = process.env.TRONSCAN_API_KEY;
  }
  return headers;
}

/**
 * Fetch TRC20 / TRON transaction info
 * @param {string} txHash
 * @returns {Promise<object>}
 */
async function getTronTransaction(txHash) {
  try {
    const headers = getTronscanHeaders();
    const [txRes, transferRes] = await Promise.all([
      axios.get(`${BASE_URL}/transaction-info`, {
        params: { hash: txHash },
        headers,
        timeout: 10000,
      }),
      axios.get(`${BASE_URL}/contract/transaction`, {
        params: { limit: 1, start: 0, hash: txHash },
        headers,
        timeout: 10000,
      }),
    ]);

    const tx = txRes.data;
    if (!tx || (!tx.hash && !tx.txID)) return null;
    // Normalize: some endpoints return txID instead of hash
    if (!tx.hash && tx.txID) tx.hash = tx.txID;

    // Try to extract TRC20 token transfer info
    const trc20Transfers = tx.trc20TransferInfo || [];
    const contractData = transferRes.data?.data?.[0];

    if (trc20Transfers.length > 0) {
      // TRC20 token transfer
      const transfer = trc20Transfers[0];
      const decimals = parseInt(transfer.decimals || '6');
      // amount_str from Tronscan is the raw integer (NOT pre-divided)
      // amount may be pre-divided float — check which one exists
      let amount;
      if (transfer.amount_str) {
        // Raw integer string — divide by decimals
        amount = (parseFloat(transfer.amount_str) / Math.pow(10, decimals)).toFixed(2);
      } else if (transfer.amount) {
        // Already a float or string float
        amount = parseFloat(transfer.amount).toFixed(2);
      } else {
        amount = '0';
      }

      return {
        network: "TRC20",
        token: transfer.symbol || "USDT",
        amount,
        from: transfer.from_address,
        to: transfer.to_address,
        toLabel: null,
        hash: tx.hash,
        timestamp: new Date(tx.timestamp)
          .toISOString()
          .replace("T", " ")
          .substring(0, 19),
        status: tx.contractRet === "SUCCESS" ? "✅ Thành công" : "❌ Thất bại",
        fee: tx.cost?.fee
          ? (tx.cost.fee / 1_000_000).toFixed(6) + " TRX"
          : "0 TRX",
        block: tx.block,
        explorerUrl: `https://tronscan.org/#/transaction/${tx.hash}`,
        contractData,
      };
    }

    // Native TRX transfer
    const trxAmount = (tx.contractData?.amount || 0) / 1_000_000;
    return {
      network: 'TRC20',
      token: 'TRX',
      amount: trxAmount.toFixed(6),
      from: tx.ownerAddress,
      to: tx.contractData?.to_address || tx.toAddress,
      toLabel: null,
      hash: tx.hash,
      timestamp: new Date(tx.timestamp).toISOString().replace('T', ' ').substring(0, 19),
      status: tx.contractRet === 'SUCCESS' ? '✅ Thành công' : '❌ Thất bại',
      fee: tx.cost?.fee ? (tx.cost.fee / 1_000_000).toFixed(6) + ' TRX' : '0 TRX',
      block: tx.block,
      explorerUrl: `https://tronscan.org/#/transaction/${tx.hash}`,
    };
  } catch (err) {
    console.error('[TRON] Error:', err.message);
    return null;
  }
}

module.exports = { getTronTransaction };
