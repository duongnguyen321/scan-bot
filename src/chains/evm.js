const axios = require('axios');
const { createRateLimiter } = require('../utils/rateLimiter');

/** Shared limiter: Etherscan v2 allows max 3 calls / sec on free tier */
const etherscanLimiter = createRateLimiter(3);

const EVM_CHAINS = {
  ETH: {
    name: 'Ethereum (ERC20)',
    network: 'ERC20',
    apiUrl: 'https://api.etherscan.io/v2/api',
    explorerUrl: 'https://etherscan.io/tx',
    apiKeyEnv: 'ETHERSCAN_API_KEY',
    chainId: 1,
    nativeToken: 'ETH',
    decimals: 18,
  },
  BEP20: {
    name: 'BNB Smart Chain (BEP20)',
    network: 'BEP20',
    apiUrl: 'https://api.bscscan.com/v2/api',
    explorerUrl: 'https://bscscan.com/tx',
    apiKeyEnv: 'BSCSCAN_API_KEY',
    chainId: 56,
    nativeToken: 'BNB',
    decimals: 18,
  },
  BSC: {
    name: 'BNB Smart Chain (BEP20)',
    network: 'BEP20',
    apiUrl: 'https://api.bscscan.com/v2/api',
    explorerUrl: 'https://bscscan.com/tx',
    apiKeyEnv: 'BSCSCAN_API_KEY',
    chainId: 56,
    nativeToken: 'BNB',
    decimals: 18,
  },
  POLYGON: {
    name: 'Polygon (MATIC)',
    network: 'Polygon',
    apiUrl: 'https://api.polygonscan.com/v2/api',
    explorerUrl: 'https://polygonscan.com/tx',
    apiKeyEnv: 'POLYGONSCAN_API_KEY',
    chainId: 137,
    nativeToken: 'MATIC',
    decimals: 18,
  },
  ARBITRUM: {
    name: 'Arbitrum One',
    network: 'Arbitrum',
    apiUrl: 'https://api.arbiscan.io/v2/api',
    explorerUrl: 'https://arbiscan.io/tx',
    apiKeyEnv: 'ARBISCAN_API_KEY',
    chainId: 42161,
    nativeToken: 'ETH',
    decimals: 18,
  },
};

function fromWei(value, decimals = 18) {
  return (parseFloat(value) / Math.pow(10, decimals)).toFixed(6);
}

const RATE_LIMIT_RE = /rate limit/i;
const MAX_RETRIES = 4;

async function etherscanRequest(chain, apiKey, params) {
  return etherscanLimiter.enqueue(async () => {
    let lastErr;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 500ms, 1s, 2s, 4s
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }

      const response = await axios.get(chain.apiUrl, {
        params: {
          chainid: chain.chainId,
          ...params,
          apikey: apiKey,
        },
        timeout: 10000,
      });

      if (response.data?.status === '0' && response.data?.message === 'NOTOK') {
        const msg = response.data.result || 'Explorer API request failed';

        // Rate-limit response — retry after backoff
        if (RATE_LIMIT_RE.test(msg)) {
          lastErr = new Error(msg);
          continue;
        }

        throw new Error(msg);
      }

      return response.data?.result;
    }

    throw lastErr;
  });
}

function parseErc20Address(topicValue, fallback) {
  if (!topicValue || typeof topicValue !== 'string' || topicValue.length < 40) {
    return fallback;
  }

  return `0x${topicValue.slice(-40)}`;
}

function decodeAbiString(hexValue) {
  if (!hexValue || hexValue === '0x') return null;

  const hex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  if (!hex) return null;

  // bytes32-style string
  if (hex.length === 64) {
    const value = Buffer.from(hex, 'hex').toString('utf8').replace(/\0+$/g, '').trim();
    return value || null;
  }

  // dynamic ABI string
  if (hex.length >= 192) {
    const length = parseInt(hex.slice(64, 128), 16);
    if (!Number.isNaN(length) && length > 0) {
      const valueHex = hex.slice(128, 128 + length * 2);
      const value = Buffer.from(valueHex, 'hex').toString('utf8').replace(/\0+$/g, '').trim();
      return value || null;
    }
  }

  return null;
}

async function getErc20Metadata(chain, apiKey, contractAddress) {
  try {
    const [symbolHex, decimalsHex] = await Promise.all([
      etherscanRequest(chain, apiKey, {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x95d89b41',
        tag: 'latest',
      }),
      etherscanRequest(chain, apiKey, {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x313ce567',
        tag: 'latest',
      }),
    ]);

    const symbol = decodeAbiString(symbolHex) || 'TOKEN';
    const decimals = decimalsHex ? parseInt(decimalsHex, 16) : 18;

    return {
      symbol,
      decimals: Number.isNaN(decimals) ? 18 : decimals,
    };
  } catch {
    return {
      symbol: 'TOKEN',
      decimals: 18,
    };
  }
}

/**
 * Get EVM transaction using explorer API
 * Tries native tx first, then ERC20 token transfer
 */
async function getEvmTransaction(txHash, chainKey) {
  const chain = EVM_CHAINS[chainKey.toUpperCase()];
  if (!chain) return null;

  const apiKey = process.env[chain.apiKeyEnv] || '';

  try {
    // Fetch raw TX
    const tx = await etherscanRequest(chain, apiKey, {
      module: 'proxy',
      action: 'eth_getTransactionByHash',
      txhash: txHash,
    });
    if (!tx) return null;

    // Fetch TX receipt for status
    const receipt = await etherscanRequest(chain, apiKey, {
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
    });

    // Fetch latest block to check confirmations
    const latestBlockHex = await etherscanRequest(chain, apiKey, {
      module: 'proxy',
      action: 'eth_blockNumber',
    }).catch(() => null);

    const latestBlock = latestBlockHex ? parseInt(latestBlockHex, 16) : 0;
    
    let status = '⏳ Đang xử lý';
    if (receipt) {
      const rawStatus = receipt.status;
      const isSuccess = rawStatus === '0x1' || rawStatus === 1 || rawStatus === '1';
      
      if (isSuccess) {
        const txBlock = tx.blockNumber ? parseInt(tx.blockNumber, 16) : 0;
        const confirmations = (latestBlock > 0 && txBlock > 0) ? Math.max(0, latestBlock - txBlock) : 0;
        
        // 12 block confirmations as standard safety threshold
        status = confirmations >= 12 ? '✅ Thành công' : '⏳ Đang xác nhận';
      } else {
        status = '❌ Thất bại';
      }
    }

    // Get block timestamp
    const block = tx.blockNumber ? await etherscanRequest(chain, apiKey, {
      module: 'proxy',
      action: 'eth_getBlockByNumber',
      tag: tx.blockNumber,
      boolean: false,
    }) : null;

    const blockTimestamp = block?.timestamp
      ? new Date(parseInt(block.timestamp, 16) * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19)
      : 'N/A';

    const gasUsed = receipt?.gasUsed ? parseInt(receipt.gasUsed, 16) : 0;
    const gasPriceHex = receipt?.effectiveGasPrice || tx.gasPrice;
    const gasPrice = gasPriceHex ? parseInt(gasPriceHex, 16) : 0;
    const feeWei = gasUsed * gasPrice;
    const fee = fromWei(feeWei) + ` ${chain.nativeToken}`;

    // Check if it's a native transfer (value > 0, or no input data)
    const value = parseInt(tx.value || '0', 16);
    if (value > 0 || !tx.input || tx.input === '0x') {
      return {
        network: chain.network,
        token: chain.nativeToken,
        amount: fromWei(value),
        from: tx.from,
        to: tx.to,
        toLabel: null,
        hash: txHash,
        timestamp: blockTimestamp,
        status,
        fee,
        block: tx.blockNumber ? parseInt(tx.blockNumber, 16) : 'N/A',
        explorerUrl: `${chain.explorerUrl}/${txHash}`,
      };
    }

    // Try to decode ERC20 transfer from receipt logs
    const erc20Transfer = await getErc20TransferFromReceipt(chain, apiKey, blockTimestamp, status, fee, tx, receipt, txHash);
    if (erc20Transfer) return erc20Transfer;

    // Fallback: return generic info
    return {
      network: chain.network,
      token: 'Contract Call',
      amount: '0',
      from: tx.from,
      to: tx.to,
      toLabel: null,
      hash: txHash,
      timestamp: blockTimestamp,
      status,
      fee,
      block: tx.blockNumber ? parseInt(tx.blockNumber, 16) : 'N/A',
      explorerUrl: `${chain.explorerUrl}/${txHash}`,
    };
  } catch (err) {
    console.error(`[${chainKey}] Error:`, err.message);
    return null;
  }
}

async function getErc20TransferFromReceipt(chain, apiKey, blockTimestamp, status, fee, tx, receipt, txHash) {
  try {
    // ERC20 Transfer event topic
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const logs = receipt?.logs || [];
    const log = logs.find((entry) => entry?.topics?.[0] === TRANSFER_TOPIC && entry?.topics?.length >= 3);
    if (!log) return null;

    const contractAddress = log.address;
    const tokenInfo = await getErc20Metadata(chain, apiKey, contractAddress);
    const rawAmount = parseInt(log.data || '0x0', 16);
    const amount = (rawAmount / Math.pow(10, tokenInfo.decimals)).toFixed(2);

    // Decode from/to from topics
    const from = parseErc20Address(log.topics[1], tx.from);
    const to = parseErc20Address(log.topics[2], tx.to);

    return {
      network: chain.network,
      token: tokenInfo.symbol,
      amount,
      from,
      to,
      toLabel: null,
      hash: txHash,
      timestamp: blockTimestamp,
      status,
      fee,
      block: log.blockNumber ? parseInt(log.blockNumber, 16) : (tx.blockNumber ? parseInt(tx.blockNumber, 16) : 'N/A'),
      explorerUrl: `${chain.explorerUrl}/${txHash}`,
    };
  } catch {
    return null;
  }
}

module.exports = { getEvmTransaction, EVM_CHAINS };
