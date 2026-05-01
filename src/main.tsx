import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { createRoot } from "react-dom/client";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AptosWalletAdapterProvider
    optInWallets={["Petra"]}
    autoConnect={false}
    dappConfig={{ network: Network.SHELBYNET }}
  >
    <App />
  </AptosWalletAdapterProvider>
);
