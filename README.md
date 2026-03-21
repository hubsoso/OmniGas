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

Network: **Base Sepolia** (Chain ID: 84532)

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
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_BOX_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...        # server-side only
RPC_URL=https://sepolia.base.org
```

### 4. Run frontend

```bash
cd frontend
yarn install
yarn dev   # http://localhost:3000
```

---

## Demo Flow

1. Connect MetaMask (Base Sepolia)
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
