const axios = require('axios');
const { createRateLimiter } = require('../utils/rateLimiter');

/** Tronscan free tier is more generous; 5/sec is a safe ceiling */
const tronLimiter = createRateLimiter(5);

const BASE_URL = 'https://apilist.tronscanapi.com/api';

const TRON_CONTRACT_TYPES = {
  1: 'TRX Transfer',
  31: 'TRC20 Transfer',
  54: 'Swap',
  55: 'Smart Contract',
  57: 'Freeze Balance',
  58: 'Resource Delegate',
  59: 'Resource Undelegate',
};

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
    const txRes = await tronLimiter.enqueue(() =>
      axios.get(`${BASE_URL}/transaction-info`, {
        params: { hash: txHash },
        headers,
        timeout: 10000,
      })
    );

    const tx = txRes.data;
    if (!tx || (!tx.hash && !tx.txID)) return null;
    // Normalize: some endpoints return txID instead of hash
    if (!tx.hash && tx.txID) tx.hash = tx.txID;

    // Try to extract TRC20 token transfer info
    const trc20Transfers = tx.trc20TransferInfo || [];

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

      let statusStr = '❌ Thất bại';
      if (tx.contractRet === 'SUCCESS') {
        statusStr = tx.confirmed ? '✅ Thành công' : '⏳ Đang xác nhận';
      } else if (!tx.contractRet) {
        statusStr = '⏳ Đang xử lý';
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
        status: statusStr,
        fee: tx.cost?.fee
          ? (tx.cost.fee / 1_000_000).toFixed(6) + " TRX"
          : "0 TRX",
        block: tx.block,
        explorerUrl: `https://tronscan.org/#/transaction/${tx.hash}`,
      };
    }

    const contractData = tx.contractData || {};
    const contractType = tx.contractType;
    const toAddress =
      contractData.to_address ||
      contractData.toAddress ||
      contractData.receiver_address ||
      tx.toAddress ||
      null;
    const amountSun =
      contractData.amount ??
      contractData.balance ??
      0;
    const amount = typeof contractData.resourceValue === 'number'
      ? contractData.resourceValue.toFixed(2)
      : (amountSun / 1_000_000).toFixed(6);
    const token = contractData.resource || (amountSun > 0 ? 'TRX' : (TRON_CONTRACT_TYPES[contractType] || 'TRON'));

    let statusStr = '❌ Thất bại';
    if (tx.contractRet === 'SUCCESS') {
      statusStr = tx.confirmed ? '✅ Thành công' : '⏳ Đang xác nhận';
    } else if (!tx.contractRet) {
      statusStr = '⏳ Đang xử lý';
    }

    return {
      network: 'TRON',
      token,
      amount,
      from: tx.ownerAddress,
      to: toAddress,
      toLabel: null,
      hash: tx.hash,
      timestamp: new Date(tx.timestamp).toISOString().replace('T', ' ').substring(0, 19),
      status: statusStr,
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
