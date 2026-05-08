import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Cloud, Globe2, Lock, Wallet, ShieldCheck, HardDrive, Trash2 } from "lucide-react";
import { shortAddr } from "@/lib/notes";
import type { AppNetworkConfig, AppNetworkId } from "@/lib/appNetwork";
import type { WalletOption } from "@/lib/walletOptions";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  encryption: boolean;
  onEncryption: (b: boolean) => void;
  walletAddr: string | null;
  wallets: WalletOption[];
  onConnect: (walletName?: string) => void;
  onDisconnect: () => void;
  noteCount: number;
  networkId: AppNetworkId;
  networkOptions: readonly AppNetworkConfig[];
  onNetworkChange: (networkId: AppNetworkId) => void;
  onClearCache?: () => void;
  onResetWorkspace?: () => void;
};

export const SettingsDialog = ({
  open,
  onOpenChange,
  encryption,
  onEncryption,
  walletAddr,
  wallets,
  onConnect,
  onDisconnect,
  noteCount,
  networkId,
  networkOptions,
  onNetworkChange,
  onClearCache,
  onResetWorkspace,
}: Props) => {
  const handleClearCache = () => {
    onClearCache?.();
    toast.success("Local cache cleared");
  };

  const handleResetWorkspace = () => {
    onResetWorkspace?.();
    toast.success("Workspace reset");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg sm:w-full rounded-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="font-display text-2xl">Settings</DialogTitle>
          <DialogDescription className="truncate sm:whitespace-normal">Manage how your notes are stored and secured.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2 min-w-0">
          {/* Encryption */}
          <Row icon={<Lock className="h-4 w-4" />} title="End-to-end encryption" subtitle="Encrypt notes locally before they reach Shelby.">
            <Switch checked={encryption} onCheckedChange={onEncryption} />
          </Row>

          {/* Storage */}
          <Row icon={<Cloud className="h-4 w-4" />} title="Storage" subtitle={`${noteCount} notes - Shelby-ready`}>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
            </span>
          </Row>

          <Row icon={<Globe2 className="h-4 w-4" />} title="Network" subtitle={networkOptions.find((network) => network.id === networkId)?.description ?? "Shelby network"}>
            <Select value={networkId} onValueChange={(value) => onNetworkChange(value as AppNetworkId)}>
              <SelectTrigger className="h-8 w-[136px] bg-background">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent align="end">
                {networkOptions.map((network) => (
                  <SelectItem key={network.id} value={network.id}>
                    {network.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row icon={<HardDrive className="h-4 w-4" />} title="Local cache" subtitle="Notes are mirrored in this browser for instant access.">
            <Button variant="outline" size="sm" className="h-8" onClick={handleClearCache}>Clear</Button>
          </Row>

          <Row icon={<Trash2 className="h-4 w-4" />} title="Reset workspace" subtitle="Remove local notes and start fresh.">
            <Button variant="outline" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={handleResetWorkspace}>
              Clear
            </Button>
          </Row>

          {/* Wallet */}
          <Row icon={<Wallet className="h-4 w-4" />} title="Wallet" subtitle={walletAddr ? `Connected - ${shortAddr(walletAddr)}` : "Not connected"}>
            {walletAddr ? (
              <Button variant="outline" size="sm" className="h-8" onClick={onDisconnect}>Disconnect</Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5 bg-gradient-brand text-white border-0 hover:opacity-90">
                    Connect
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {wallets.length > 0 ? (
                    wallets.map((wallet) => (
                      <DropdownMenuItem key={wallet.name} onClick={() => onConnect(wallet.name)} className="gap-2">
                        {wallet.icon ? <img src={wallet.icon} alt="" className="h-4 w-4 rounded-sm" /> : <Wallet className="h-4 w-4" />}
                        <span>{wallet.name}</span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>No wallets found</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </Row>

          {walletAddr && (
            <div className="rounded-lg border border-primary/20 bg-gradient-soft p-3 flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-xs text-foreground/80">
                <div className="font-semibold text-foreground">You own your notes.</div>
                Every encrypted note is signed by your wallet before it is stored on Shelby.
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 sm:gap-4 p-3 rounded-lg border border-border bg-card min-w-0">
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="h-8 w-8 rounded-md bg-secondary grid place-items-center text-foreground/70 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);
