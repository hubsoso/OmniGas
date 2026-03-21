# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

OmniGas is a gasless transaction demo built for a hackathon. The core concept: users deposit USDC into a prepaid Gas Pool, then execute on-chain actions without holding any native gas token. A backend Relayer pays gas and deducts from their pool balance.

**Target network:** Sepolia (Chain ID: 11155111)

## Architecture

The system has three layers:

### Smart Contracts (Foundry, `contracts/`)
Four contracts form the on-chain system:
- **MockUSDC** — mintable ERC20 for testing (6 decimals)
- **MockBOX** — mintable ERC20 for testing (18 decimals)
- **GasVault** — multi-token prepaid balance pool; only `DemoExecutor` can call `deduct()`
- **DemoNFT** — ERC721 where only `DemoExecutor` can call `mint()`
- **DemoExecutor** — entry point for the relayer; calls `vault.deduct()` then `nft.mint()` atomically. Fixed fee: 0.2 USDC / 0.2 BOX (2x markup on ~0.1 gas cost; actual amounts: 200_000 for USDC, 2e17 for BOX)

Permission chain: `Relayer wallet → DemoExecutor (onlyRelayer) → GasVault.deduct + DemoNFT.mint`

### Backend Relay (Next.js API Routes, `frontend/pages/api/`)
Three routes, all using the relayer's private key server-side:
- `POST /api/relay` — accepts `{userAddress, feeToken}`, simulates then sends `executor.gaslessMint(user, feeToken)`, returns `{txHash, blockNumber}`
- `GET /api/balance?address=0x...` — returns `{usdcBalance, boxBalance, nftCount}` by querying vault
- `POST /api/faucet` — accepts `{userAddress}`, mints 10 MockUSDC to user (in-memory dedup, resets on restart), returns `{txHash}`

### Frontend (Next.js + viem, `frontend/pages/index.tsx`)
Single-page app with multi-token support. User flow:
1. Connect MetaMask (must be on Sepolia, chain ID 11155111)
2. Select gas token: ETH (native, requires balance) or USDC/BOX (from vault)
3. For USDC/BOX: claim via faucet API → approve + deposit to GasVault (two MetaMask confirmations, user pays gas)
4. Click "Gasless Mint" → calls `/api/relay` with `{userAddress, feeToken}` → relayer executes → success shown with tx hash and block explorer link

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
# frontend/.env.local (Next.js)
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_USDC_ADDRESS=0x...          # deployed MockUSDC address
NEXT_PUBLIC_BOX_ADDRESS=0x...           # deployed MockBOX address
NEXT_PUBLIC_VAULT_ADDRESS=0x...         # deployed GasVault address
NEXT_PUBLIC_NFT_ADDRESS=0x...           # deployed DemoNFT address
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...      # deployed DemoExecutor address
RELAYER_PRIVATE_KEY=0x...               # server-side only, never expose with NEXT_PUBLIC_
RPC_URL=https://rpc.sepolia.org

# contracts/.env (Foundry)
PRIVATE_KEY=0x...                       # deployer's private key
RELAYER_ADDRESS=0x...                   # relayer wallet address (from RELAYER_PRIVATE_KEY)
RPC_URL=https://rpc.sepolia.org
ETHERSCAN_API_KEY=...                   # for contract verification (optional)
```

## MCP Servers

- **apifox** — API schema reference (`mcp__apifox__read_project_oas_28zr5e`)
- **lark** — document integration
