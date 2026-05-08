import { createContext, useContext, type ReactNode } from "react";
import { Network } from "@aptos-labs/ts-sdk";

export type AppNetworkId = "shelbynet" | "testnet";

export type AppNetworkConfig = {
  id: AppNetworkId;
  label: string;
  shortLabel: string;
  description: string;
  aptosNetwork: Network.SHELBYNET | Network.TESTNET;
  fullnodeUrl?: string;
  indexerUrl?: string;
  shelbyRpcUrl?: string;
};

export const NETWORK_STORAGE_KEY = "justnote:network";

export const NETWORK_OPTIONS: readonly AppNetworkConfig[] = [
  {
    id: "shelbynet",
    label: "ShelbyNet",
    shortLabel: "ShelbyNet",
    description: "Default Shelby network",
    aptosNetwork: Network.SHELBYNET,
  },
  {
    id: "testnet",
    label: "Shelby Testnet",
    shortLabel: "Testnet",
    description: "Aptos testnet with Shelby RPC",
    aptosNetwork: Network.TESTNET,
    fullnodeUrl: "https://api.testnet.aptoslabs.com/v1",
    indexerUrl: "https://api.testnet.aptoslabs.com/v1/graphql",
    shelbyRpcUrl: "https://api.testnet.shelby.xyz/shelby",
  },
] as const;

const NETWORKS_BY_ID = new Map<AppNetworkId, AppNetworkConfig>(
  NETWORK_OPTIONS.map((network) => [network.id, network])
);

export const DEFAULT_NETWORK_ID: AppNetworkId = "shelbynet";

export const normalizeNetworkId = (value: unknown): AppNetworkId | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "shelbynet" || normalized === "shelby") return "shelbynet";
  if (normalized === "testnet" || normalized === "shelby-testnet" || normalized === "shelby_testnet") return "testnet";
  return null;
};

export const getNetworkConfig = (networkId: AppNetworkId = DEFAULT_NETWORK_ID) =>
  NETWORKS_BY_ID.get(networkId) ?? NETWORKS_BY_ID.get(DEFAULT_NETWORK_ID)!;

export const storeNetworkId = (networkId: AppNetworkId) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NETWORK_STORAGE_KEY, networkId);
};

export const getInitialNetworkId = (): AppNetworkId => {
  const envNetwork = normalizeNetworkId(import.meta.env.VITE_SHELBY_NETWORK);
  if (envNetwork) return envNetwork;

  if (typeof window === "undefined") return DEFAULT_NETWORK_ID;
  return normalizeNetworkId(window.localStorage.getItem(NETWORK_STORAGE_KEY)) ?? DEFAULT_NETWORK_ID;
};

type AppNetworkContextValue = {
  networkId: AppNetworkId;
  network: AppNetworkConfig;
  networkOptions: readonly AppNetworkConfig[];
  setNetworkId: (networkId: AppNetworkId) => void;
};

const AppNetworkContext = createContext<AppNetworkContextValue | null>(null);

export const AppNetworkProvider = ({
  children,
  networkId,
  setNetworkId,
}: {
  children: ReactNode;
  networkId: AppNetworkId;
  setNetworkId: (networkId: AppNetworkId) => void;
}) => (
  <AppNetworkContext.Provider
    value={{
      networkId,
      network: getNetworkConfig(networkId),
      networkOptions: NETWORK_OPTIONS,
      setNetworkId,
    }}
  >
    {children}
  </AppNetworkContext.Provider>
);

export const useAppNetwork = () => {
  const value = useContext(AppNetworkContext);
  if (!value) throw new Error("useAppNetwork must be used inside AppNetworkProvider");
  return value;
};
