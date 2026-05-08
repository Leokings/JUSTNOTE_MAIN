import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import type { ShelbyClient, ShelbyClientConfig } from "@shelby-protocol/sdk/browser";
import { DEFAULT_NETWORK_ID, getNetworkConfig, type AppNetworkId } from "@/lib/appNetwork";

const globalApiKey = import.meta.env.VITE_SHELBY_API_KEY;
const testnetApiKey = import.meta.env.VITE_SHELBY_TESTNET_API_KEY;

const validApiKey = (key: string | undefined) => (key && key !== "dummy_key" ? key : undefined);
const getApiKey = (networkId: AppNetworkId) =>
  validApiKey(networkId === "testnet" ? testnetApiKey || globalApiKey : globalApiKey);

const shelbyClients = new Map<AppNetworkId, ShelbyClient>();
const aptosClients = new Map<AppNetworkId, Aptos>();

// Lazy-initialized Shelby clients avoid import-time crashes and keep network switches isolated.
export const getShelbyClient = async (networkId: AppNetworkId = DEFAULT_NETWORK_ID): Promise<ShelbyClient> => {
  const cached = shelbyClients.get(networkId);
  if (cached) return cached;

  const network = getNetworkConfig(networkId);
  const apiKey = getApiKey(networkId);
  const { ShelbyClient } = await import("@shelby-protocol/sdk/browser");
  const config: ShelbyClientConfig = {
    network: network.aptosNetwork,
    aptos: {
      network: network.aptosNetwork,
      ...(network.fullnodeUrl ? { fullnode: network.fullnodeUrl } : {}),
      ...(network.indexerUrl ? { indexer: network.indexerUrl } : {}),
    },
    ...(apiKey ? { apiKey } : {}),
    ...(network.shelbyRpcUrl ? { rpc: { baseUrl: network.shelbyRpcUrl, ...(apiKey ? { apiKey } : {}) } } : {}),
    ...(network.indexerUrl ? { indexer: { baseUrl: network.indexerUrl, ...(apiKey ? { apiKey } : {}) } } : {}),
  };

  const client = new ShelbyClient(config);
  shelbyClients.set(networkId, client);
  return client;
};

export const getAptosClient = (networkId: AppNetworkId = DEFAULT_NETWORK_ID) => {
  const cached = aptosClients.get(networkId);
  if (cached) return cached;

  const network = getNetworkConfig(networkId);
  const client = new Aptos(
    new AptosConfig({
      network: network.aptosNetwork,
      ...(network.fullnodeUrl ? { fullnode: network.fullnodeUrl } : {}),
      ...(network.indexerUrl ? { indexer: network.indexerUrl } : {}),
    })
  );

  aptosClients.set(networkId, client);
  return client;
};
