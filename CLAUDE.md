# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OmniGas is a gasless transaction demo built for a hackathon. The core concept: users deposit USDC into a prepaid Gas Pool, then execute on-chain actions without holding any native gas token. A backend Relayer pays gas and deducts from their pool balance.

**Target network:** Base Sepolia (Chain ID: 84532)

## Architecture

The system has three layers:

### Smart Contracts (Foundry, `contracts/`)
Four contracts form the on-chain system:
- **MockUSDC** — mintable ERC20 for testing
- **GasVault** — holds user USDC balances; only `DemoExecutor` can call `deduct()`
- **DemoNFT** — ERC721 where only `DemoExecutor` can call `mint()`
- **DemoExecutor** — entry point for the relayer; calls `vault.deduct()` then `nft.mint()` atomically. Fixed fee: 0.1 USDC (100_000 in 6-decimal units)

Permission chain: `Relayer wallet → DemoExecutor (onlyRelayer) → GasVault.deduct + DemoNFT.mint`

### Backend Relay (Next.js API Routes, `src/app/api/`)
Three routes, all using the relayer's private key server-side:
- `POST /api/relay` — validates user address, simulates then sends `executor.gaslessMint(user)`, waits for receipt
- `GET /api/balance?address=0x...` — returns vault balance (USDC) and NFT count
- `POST /api/faucet` — mints 10 MockUSDC to user (in-memory dedup, resets on restart)

### Frontend (Next.js + wagmi/viem, `src/app/page.tsx`)
Single-page app. User flow:
1. Connect MetaMask
2. Claim free USDC via faucet API
3. Approve + deposit USDC to GasVault (two MetaMask confirmations, user pays gas here)
4. Click "Gasless Mint" → calls `/api/relay` → relayer sends tx → success shown with tx hash

## Development Commands

```bash
npm run dev      # Start Next.js dev server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
```

### Contracts (Foundry)

```bash
cd contracts
forge build
forge test -vvv
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
```

## Key Files

- `docs/contracts.md` — full contract source code and deploy instructions
- `docs/relay.md` — API route implementations and ABI definitions
- `docs/frontend.md` — complete `page.tsx` source and setup steps
- `contracts/deployments.json` — deployed contract addresses (fill after deploy, shared by frontend and relay)
- `src/lib/contracts.ts` — contract address constants for frontend
- `src/lib/abi.ts` — minimal ABI fragments used by frontend and relay

## Environment Variables

```
# .env.local (Next.js)
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...   # server-side only, never NEXT_PUBLIC_
RPC_URL=https://sepolia.base.org

# contracts/.env (Foundry)
PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RPC_URL=https://sepolia.base.org
ETHERSCAN_API_KEY=...
```

## MCP Servers

- **apifox** — API schema reference (`mcp__apifox__read_project_oas_28zr5e`)
- **lark** — document integration
