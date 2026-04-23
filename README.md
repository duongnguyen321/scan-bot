# 🤖 Donkeij Check Bill Bot

Telegram bot kiểm tra thông tin giao dịch crypto trên nhiều blockchain.

## Hỗ trợ

| Network | Alias | Explorer |
|---------|-------|----------|
| TRC20 / TRON | `TRC20`, `TRON`, `TRX`, `TRONSCAN` | Tronscan |
| Ethereum | `ETH`, `ERC20`, `ETHEREUM` | Etherscan |
| BNB Chain | `BEP20`, `BSC`, `BNB` | BSCScan |
| Polygon | `POLYGON`, `MATIC` | Polygonscan |
| Arbitrum | `ARB`, `ARBITRUM` | Arbiscan |

## Cài đặt

### 1. Clone & Install
```bash
npm install
```

### Đăng ký bot

Vào telegram, tìm `@BotFather`
`/newbot` và điền thông tin, copy token
`/setprivacy` chọn bot và chọn `Disable`

### 2. Tạo .env
```bash
cp .env.example .env
```

Điền vào `.env`:
```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather

# Lấy free API key tại:
# https://etherscan.io/myapikey
ETHERSCAN_API_KEY=your_key

# Chỉ cần đăng ký tài khoản https://bscscan.com, không được sửa
BSCSCAN_API_KEY=${ETHERSCAN_API_KEY}

# Chỉ cần đăng ký tài khoản https://polygonscan.com, không được sửa
POLYGONSCAN_API_KEY=${ETHERSCAN_API_KEY}

# Chỉ cần đăng ký tài khoản https://arbiscan.io, không được sửa
ARBISCAN_API_KEY=${ETHERSCAN_API_KEY}
```

**TRC20 / Tronscan**: Không cần API key, miễn phí hoàn toàn.
> Nhưng cũng có thể lấy key ở: https://tronscan.org/#/myaccount/apiKeys

### 3. Chạy bot
```bash
# Production
npm start

# Development (auto-reload, Node.js 18+)
npm run dev
```

## Cách dùng

Gửi vào chat Telegram:
```
TRC20 c1e8cd8bbb76b04cb2ae1c3d6916b0ae42b9ee048e2cc907c6f54c177fed35d1
ETH 0xabc123...
USDT TRC20 <hash>
BEP20 0x...
```

Bot sẽ tự detect network nếu không ghi rõ:
- Hash bắt đầu bằng `0x` → thử ETH trước
- Hash 64 ký tự hex thuần → thử TRC20

## Deploy (Ubuntu server)

### Dùng PM2
```bash
npm install -g pm2
pm2 start index.js --name donkeij-check-bill
pm2 save
pm2 startup
```

## Cấu trúc project

```
donkeij-check-bill/
├── index.js                    # Entry point, Telegraf setup
├── .env                        # API keys (gitignore)
├── .env.example
└── src/
    ├── chains/
    │   ├── tron.js             # Tronscan API handler
    │   └── evm.js              # Etherscan-compatible APIs
    ├── handlers/
    │   └── txHandler.js        # Telegram message routing
    └── utils/
        └── parser.js           # Parse input, format output
```

## Mở rộng thêm chain

Thêm vào `src/chains/evm.js` trong object `EVM_CHAINS`:
```js
OPTIMISM: {
  name: 'Optimism',
  network: 'Optimism',
  apiUrl: 'https://api-optimistic.etherscan.io/api',
  explorerUrl: 'https://optimistic.etherscan.io/tx',
  apiKeyEnv: 'OPTIMISM_API_KEY',
  nativeToken: 'ETH',
  decimals: 18,
},
```

Thêm alias vào `src/utils/parser.js`:
```js
OPTIMISM: 'OPTIMISM',
OP: 'OPTIMISM',
```
