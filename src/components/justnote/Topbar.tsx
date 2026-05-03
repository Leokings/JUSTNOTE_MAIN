import { Search, Wallet, Settings, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { shortAddr } from "@/lib/mockData";
import { cn } from "@/lib/utils";

type Props = {
  query: string;
  onQuery: (s: string) => void;
  walletAddr: string | null;
  onConnectWallet: () => void;
  onOpenSettings: () => void;
  onBack?: () => void;
};

export const Topbar = ({ query, onQuery, walletAddr, onConnectWallet, onOpenSettings, onBack }: Props) => {
  const connected = !!walletAddr;
  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 sticky top-0 z-20">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-9 w-9 shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
      <div className="relative flex-1 max-w-xl">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search notes, tags, content…"
          className="pl-9 h-9 bg-secondary/60 border-transparent focus-visible:bg-card focus-visible:border-border rounded-lg"
        />
        <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      <div className="flex-1" />

      <Button
        onClick={onConnectWallet}
        variant={connected ? "outline" : "default"}
        className={cn(
          "h-9 rounded-lg gap-2 whitespace-nowrap shrink-0",
          connected
            ? "border-primary/30 bg-accent text-accent-foreground hover:bg-accent/80"
            : "bg-gradient-brand text-white border-0 hover:opacity-90 shadow-soft"
        )}
      >
        {connected ? (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_currentColor]" />
            <span className="font-mono text-xs">{shortAddr(walletAddr!)}</span>
            <Check className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </>
        )}
      </Button>

      <ThemeToggle />

      <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings" className="rounded-full hover:bg-accent">
        <Settings className="h-[18px] w-[18px]" />
      </Button>
    </header>
  );
};
