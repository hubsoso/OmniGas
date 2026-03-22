# OmniGas

**Gasless transactions powered by prepaid USDC / BOX.**

Users deposit tokens into OmniGas's Gas Pool. A backend Relayer pays native gas on their behalf and deducts a small service fee from their balance — no ETH required.

---

## How it works

```
User (no ETH)
  │
  ├─ deposit USDC or BOX → GasVault
  │
  └─ click "Gasless Mint"
        │
        ▼
    OmniGas Relayer  ──pays gas (ETH)──▶  DemoExecutor
                                               │
                                         ┌─────┴──────┐
                                         ▼            ▼
                                    GasVault       DemoNFT
                                   deduct fee      mint NFT
```

**Fee: 0.2 USDC or 0.2 BOX per action** (2× gas cost, platform earns the spread)

---

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `MockUSDC` | Mintable ERC20, 6 decimals |
| `MockBOX` | Mintable ERC20, 18 decimals |
| `GasVault` | Holds user balances per token; only Executor can deduct |
| `DemoNFT` | ERC721; only Executor can mint |
| `DemoExecutor` | Relayer entry point — deducts fee then mints atomically |

Permission chain: `Relayer → DemoExecutor (onlyRelayer) → GasVault.deduct + DemoNFT.mint`

Network: **Sepolia** (Chain ID: 11155111)

---

## Project Structure

```
contracts/                Foundry — smart contracts + tests + deploy script
  src/
    MockUSDC.sol          Mintable ERC20, 6 decimals
    MockBOX.sol           Mintable ERC20, 18 decimals
    GasVault.sol          Multi-token prepaid balance pool
    DemoNFT.sol           ERC721, only Executor can mint
    DemoExecutor.sol      Relayer entry point
  script/Deploy.s.sol
  test/OmniGas.t.sol

frontend/                 Next.js (pages router) — swap widget + gas selector
  pages/index.tsx         Main page: Uniswap SwapWidget + OmniGas gas selector
  styles/OmniGas.module.css
  lib/
    paymasterClient.ts
    sendGaslessTransaction.ts

src/app/api/              Next.js API routes — Relayer backend
  relay/                  POST /api/relay
  balance/                GET  /api/balance?address=
  faucet/                 POST /api/faucet

docs/
  plan.md                 Unified development plan
  contracts.md            Contract source & deploy instructions
  relay.md                API route implementations
  frontend.md             Frontend integration guide
```

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/hubsoso/OmniGas
cd OmniGas
```

### 2. Deploy contracts

```bash
cd contracts
forge install
cp .env.example .env   # fill PRIVATE_KEY, RELAYER_ADDRESS, RPC_URL
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

Copy the printed addresses into `frontend/.env.local`.

### 3. Configure environment

```bash
# frontend/.env.local
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_BOX_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...        # server-side only
RPC_URL=https://rpc.sepolia.org
```

### 4. Run frontend

```bash
cd frontend
yarn install
yarn dev   # http://localhost:3000
```

### 5. Deploy to Vercel

The Next.js app lives in `frontend/`, so set the Vercel project Root Directory to `frontend`.

In the Vercel dashboard:

1. Import this repository.
2. Set `Root Directory` to `frontend`.
3. Keep the framework as `Next.js`.
4. Add the environment variables from `frontend/.env.example`, replacing placeholder addresses and `RELAYER_PRIVATE_KEY` with your real values.
5. Deploy.

If you use the CLI:

```bash
cd frontend
vercel
vercel --prod
```

Recommended environment variables for production:

```bash
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://rpc.sepolia.org
RPC_URL=https://rpc.sepolia.org
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_BOX_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
NEXT_PUBLIC_TRANSFER_EXECUTOR_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BASE_USDC_ADDRESS=0x...
NEXT_PUBLIC_BASE_BOX_ADDRESS=0x...
NEXT_PUBLIC_BASE_EXECUTOR_ADDRESS=0x...
NEXT_PUBLIC_BASE_TRANSFER_EXECUTOR_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...
```

Notes:

- `RELAYER_PRIVATE_KEY` must be added as a server-side secret in Vercel and must not use the `NEXT_PUBLIC_` prefix.
- `frontend/vercel.json` sets longer execution windows for the relay APIs so chain simulation and receipt waiting are less likely to time out during deployment runtime.

---

## Demo Flow

1. Connect MetaMask (Sepolia)
2. Click **Get 10 Free USDC** — faucet mints MockUSDC to your wallet
3. Click **Deposit 10 USDC** — approve + deposit (2 MetaMask confirmations)
4. Confirm your wallet shows **0 ETH**
5. Click **Gasless Mint** — relayer pays gas, NFT minted, 0.2 USDC deducted

---

## Contract Tests

```bash
cd contracts
forge test -vvv
```

9 tests covering deposit, gasless mint (USDC & BOX), mixed-token mints, and error paths.
