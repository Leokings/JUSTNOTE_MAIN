import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import type { AvailableWallets } from "@aptos-labs/wallet-adapter-core";
import { AppNetworkProvider, getInitialNetworkId, getNetworkConfig, storeNetworkId, type AppNetworkId } from "@/lib/appNetwork";
import App from "./App.tsx";
import "./index.css";

const WALLET_OPT_INS: readonly AvailableWallets[] = [
  "Petra",
  "Petra Web",
  "Continue with Google",
  "Continue with Apple",
  "OKX Wallet",
  "Nightly",
  "Backpack",
  "Bitget Wallet",
  "Gate Wallet",
  "Cosmostation Wallet",
  "Watchee",
];

const Root = () => {
  const [networkId, setNetworkIdState] = useState<AppNetworkId>(() => getInitialNetworkId());
  const network = getNetworkConfig(networkId);

  const setNetworkId = useCallback((nextNetworkId: AppNetworkId) => {
    storeNetworkId(nextNetworkId);
    setNetworkIdState(nextNetworkId);
  }, []);

  return (
    <AptosWalletAdapterProvider
      key={networkId}
      optInWallets={WALLET_OPT_INS}
      hideWallets={[]}
      autoConnect={false}
      dappConfig={{ network: network.aptosNetwork }}
    >
      <AppNetworkProvider networkId={networkId} setNetworkId={setNetworkId}>
        <App />
      </AppNetworkProvider>
    </AptosWalletAdapterProvider>
  );
};

createRoot(document.getElementById("root")!).render(<Root />);
