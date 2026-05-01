import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const apiKey = import.meta.env.VITE_SHELBY_API_KEY;
const validApiKey = apiKey && apiKey !== "dummy_key" ? apiKey : undefined;

// Lazy-initialized Shelby client to avoid import-time crashes
let _shelbyClient: any = null;

export const getShelbyClient = async () => {
  if (!_shelbyClient) {
    const { ShelbyClient } = await import("@shelby-protocol/sdk/browser");
    _shelbyClient = new ShelbyClient({
      network: Network.SHELBYNET,
      ...(validApiKey ? { apiKey: validApiKey } : {}),
    });
  }
  return _shelbyClient;
};

// Aptos client for transaction confirmation on ShelbyNet
export const aptosClient = new Aptos(
  new AptosConfig({
    network: Network.SHELBYNET,
  })
);
