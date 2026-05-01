# JustNote
A decentralized note-taking app powered by the Shelby Protocol and Aptos Blockchain.

## Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your API keys:
   - `VITE_SHELBY_API_KEY`: Your Shelby API key
   - `VITE_APTOS_API_KEY`: Your Aptos API key (optional, for testnet rate limits)
4. Run the development server: `npm run dev`

## Features
- **On-chain Storage**: Notes are stored securely and immutably using the Shelby Protocol.
- **Wallet Integration**: Connect your Aptos wallet (e.g., Petra, Martian) to manage your notes.
- **Encryption**: Optional client-side AES-GCM encryption for complete privacy.
