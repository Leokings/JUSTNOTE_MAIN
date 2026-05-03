import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Cloud, Lock, Wallet, ShieldCheck, HardDrive, Trash2 } from "lucide-react";
import { shortAddr } from "@/lib/mockData";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  encryption: boolean;
  onEncryption: (b: boolean) => void;
  walletAddr: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  noteCount: number;
  onClearMockData?: () => void;
};

export const SettingsDialog = ({ open, onOpenChange, encryption, onEncryption, walletAddr, onConnect, onDisconnect, noteCount, onClearMockData }: Props) => {
  const handleClearMock = () => {
    localStorage.removeItem("justnote:mockData");
    localStorage.removeItem("justnote:notes");
    onClearMockData?.();
    toast.success("Mock data cleared");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg sm:w-full rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Settings</DialogTitle>
          <DialogDescription>Manage how your notes are stored and secured.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Encryption */}
          <Row icon={<Lock className="h-4 w-4" />} title="End-to-end encryption" subtitle="Encrypt notes locally before they reach Shelby.">
            <Switch checked={encryption} onCheckedChange={onEncryption} />
          </Row>

          {/* Storage */}
          <Row icon={<Cloud className="h-4 w-4" />} title="Storage" subtitle={`${noteCount} notes — Stored on Shelby`}>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
            </span>
          </Row>

          <Row icon={<HardDrive className="h-4 w-4" />} title="Local cache" subtitle="Notes are mirrored in this browser for instant access.">
            <Button variant="outline" size="sm" className="h-8">Clear</Button>
          </Row>

          {/* Clear Mock Data */}
          <Row icon={<Trash2 className="h-4 w-4" />} title="Clear mock data" subtitle="Remove sample notes and start fresh.">
            <Button variant="outline" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={handleClearMock}>
              Clear
            </Button>
          </Row>

          {/* Wallet */}
          <Row icon={<Wallet className="h-4 w-4" />} title="Wallet" subtitle={walletAddr ? `Connected — ${shortAddr(walletAddr)}` : "Not connected"}>
            {walletAddr ? (
              <Button variant="outline" size="sm" className="h-8" onClick={onDisconnect}>Disconnect</Button>
            ) : (
              <Button size="sm" className="h-8 bg-gradient-brand text-white border-0 hover:opacity-90" onClick={onConnect}>Connect</Button>
            )}
          </Row>

          {walletAddr && (
            <div className="rounded-lg border border-primary/20 bg-gradient-soft p-3 flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-xs text-foreground/80">
                <div className="font-semibold text-foreground">You own your notes.</div>
                Every note is signed by your wallet and content-addressed on Shelby. No one — not even us — can read or remove them.
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
