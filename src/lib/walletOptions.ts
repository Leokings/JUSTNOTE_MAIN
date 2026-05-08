export type WalletOption = {
  name: string;
  icon?: string;
  url?: string;
};

export const combineWalletOptions = (
  ...walletGroups: Array<ReadonlyArray<WalletOption> | undefined>
): WalletOption[] => {
  const seen = new Set<string>();
  const options: WalletOption[] = [];

  walletGroups.flatMap((group) => group ?? []).forEach((wallet) => {
    if (!wallet?.name || seen.has(wallet.name)) return;
    seen.add(wallet.name);
    options.push(wallet);
  });

  return options;
};
