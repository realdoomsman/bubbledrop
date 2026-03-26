# 🫧 BubbleDrop — Solana Holder Airdrop Tool

Airdrop tokens to the top holders of any Solana coin. Scan holders, buy supply, and distribute automatically — all from your browser.

![BubbleDrop Preview](https://img.shields.io/badge/Solana-Mainnet-green?style=flat-square&logo=solana)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## ✨ Features

- **🔍 Scan Token Holders** — Paste any SPL token mint address to fetch the top 50 holders via Helius DAS API
- **👥 Select Recipients** — Slider to choose 1–50 top holders for the airdrop
- **💰 Wallet Management** — Generate new Solana wallets or reuse previously saved ones (stored in browser localStorage)
- **⚡ Auto Buy & Distribute** — Swaps SOL → token via Jupiter v6, then distributes evenly to selected holders
- **📊 Real-time Progress** — Live transaction log with Solscan links for every batch

## 🚀 Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/bubbledrop.git
   cd bubbledrop
   ```

2. Serve it locally (any static server works):
   ```bash
   python3 -m http.server 8080
   ```

3. Open `http://localhost:8080` in your browser

4. Get a free Helius API key at [helius.dev](https://dev.helius.xyz) and paste it in

## 📋 How It Works

| Step | Description |
|------|-------------|
| **1. Scan** | Enter a token mint address → fetches top 50 holders from Solana |
| **2. Select** | Use the slider to pick how many holders (1–50) receive the airdrop |
| **3. Wallet** | Generate a new Solana keypair or select a previously saved one |
| **4. Execute** | Fund the wallet with SOL → buys the token via Jupiter → distributes to holders |

## 🔧 Tech Stack

- **Pure HTML/CSS/JS** — No frameworks, no build step
- **@solana/web3.js** — Blockchain interactions
- **Helius DAS API** — Fast holder scanning
- **Jupiter v6 API** — Token swaps
- **Premium dark theme** — Glassmorphism, gradients, micro-animations

## ⚙️ Requirements

- A free **Helius API key** (get one at [helius.dev](https://dev.helius.xyz))
- SOL in your wallet for purchasing tokens and paying tx fees
- A modern browser (Chrome, Firefox, Edge)

## ⚠️ Disclaimer

This tool is for educational purposes. Use at your own risk. Always verify transactions before executing. Never share your private keys. The developers are not responsible for any loss of funds.

## 📄 License

MIT
