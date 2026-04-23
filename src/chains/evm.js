const axios = require('axios');

const EVM_CHAINS = {
  ETH: {
    name: 'Ethereum (ERC20)',
    network: 'ERC20',
    apiUrl: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io/tx',
    apiKeyEnv: 'ETHERSCAN_API_KEY',
    nativeToken: 'ETH',
    decimals: 18,
  },
  BEP20: {
    name: 'BNB Smart Chain (BEP20)',
    network: 'BEP20',
    apiUrl: 'https://api.bscscan.com/api',
    explorerUrl: 'https://bscscan.com/tx',
    apiKeyEnv: 'BSCSCAN_API_KEY',
    nativeToken: 'BNB',
    decimals: 18,
  },
  BSC: {
    name: 'BNB Smart Chain (BEP20)',
    network: 'BEP20',
    apiUrl: 'https://api.bscscan.com/api',
    explorerUrl: 'https://bscscan.com/tx',
    apiKeyEnv: 'BSCSCAN_API_KEY',
    nativeToken: 'BNB',
    decimals: 18,
  },
  POLYGON: {
    name: 'Polygon (MATIC)',
    network: 'Polygon',
    apiUrl: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com/tx',
    apiKeyEnv: 'POLYGONSCAN_API_KEY',
    nativeToken: 'MATIC',
    decimals: 18,
  },
  ARBITRUM: {
    name: 'Arbitrum One',
    network: 'Arbitrum',
    apiUrl: 'https://api.arbiscan.io/api',
    explorerUrl: 'https://arbiscan.io/tx',
    apiKeyEnv: 'ARBISCAN_API_KEY',
    nativeToken: 'ETH',
    decimals: 18,
  },
};

function fromWei(value, decimals = 18) {
  return (parseFloat(value) / Math.pow(10, decimals)).toFixed(6);
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
    const txRes = await axios.get(chain.apiUrl, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: txHash,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const tx = txRes.data?.result;
    if (!tx) return null;

    // Fetch TX receipt for status
    const receiptRes = await axios.get(chain.apiUrl, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash: txHash,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const receipt = receiptRes.data?.result;
    // Etherscan returns '0x1' (string) or 1 (number) for success
    const rawStatus = receipt?.status;
    const isSuccess = rawStatus === '0x1' || rawStatus === 1 || rawStatus === '1';
    // If receipt is null (pending tx), treat as unknown
    const status = receipt == null ? '⏳ Đang xử lý' : (isSuccess ? '✅ Thành công' : '❌ Thất bại');

    // Get block timestamp
    const blockRes = await axios.get(chain.apiUrl, {
      params: {
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: tx.blockNumber,
        boolean: false,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const blockTimestamp = blockRes.data?.result?.timestamp
      ? new Date(parseInt(blockRes.data.result.timestamp, 16) * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19)
      : 'N/A';

    const gasUsed = receipt?.gasUsed ? parseInt(receipt.gasUsed, 16) : 0;
    const gasPrice = tx.gasPrice ? parseInt(tx.gasPrice, 16) : 0;
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
        block: parseInt(tx.blockNumber, 16),
        explorerUrl: `${chain.explorerUrl}/${txHash}`,
      };
    }

    // Try to decode ERC20 transfer from logs
    const erc20Transfer = await getErc20TransferFromLogs(txHash, chain, apiKey, blockTimestamp, status, fee, tx);
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
      block: parseInt(tx.blockNumber, 16),
      explorerUrl: `${chain.explorerUrl}/${txHash}`,
    };
  } catch (err) {
    console.error(`[${chainKey}] Error:`, err.message);
    return null;
  }
}

async function getErc20TransferFromLogs(txHash, chain, apiKey, blockTimestamp, status, fee, tx) {
  try {
    // ERC20 Transfer event topic
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const logsRes = await axios.get(chain.apiUrl, {
      params: {
        module: 'logs',
        action: 'getLogs',
        txhash: txHash,
        topic0: TRANSFER_TOPIC,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const logs = logsRes.data?.result;
    if (!logs || logs.length === 0) return null;

    const log = logs[0];
    const contractAddress = log.address;

    // Get token info
    const tokenRes = await axios.get(chain.apiUrl, {
      params: {
        module: 'token',
        action: 'tokeninfo',
        contractaddress: contractAddress,
        apikey: apiKey,
      },
      timeout: 10000,
    });

    const tokenInfo = tokenRes.data?.result?.[0];
    const symbol = tokenInfo?.symbol || 'TOKEN';
    const decimals = parseInt(tokenInfo?.divisor || '18');
    const rawAmount = parseInt(log.data, 16);
    const amount = (rawAmount / Math.pow(10, decimals)).toFixed(2);

    // Decode from/to from topics
    const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : tx.from;
    const to = log.topics[2] ? '0x' + log.topics[2].slice(26) : tx.to;

    return {
      network: chain.network,
      token: symbol,
      amount,
      from,
      to,
      toLabel: null,
      hash: txHash,
      timestamp: blockTimestamp,
      status,
      fee,
      block: parseInt(log.blockNumber, 16),
      explorerUrl: `${chain.explorerUrl}/${txHash}`,
    };
  } catch {
    return null;
  }
}

module.exports = { getEvmTransaction, EVM_CHAINS };
