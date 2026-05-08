import { Search, Wallet, Settings, ChevronLeft, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { shortAddr } from "@/lib/notes";
import type { WalletOption } from "@/lib/walletOptions";
import { useEffect, useRef } from "react";

type Props = {
  query: string;
  onQuery: (s: string) => void;
  walletAddr: string | null;
  wallets: WalletOption[];
  onConnectWallet: (walletName?: string) => void;
  onOpenSettings: () => void;
  onBack?: () => void;
};

export const Topbar = ({ query, onQuery, walletAddr, wallets, onConnectWallet, onOpenSettings, onBack }: Props) => {
  const connected = !!walletAddr;
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-2 sm:gap-3 px-2 sm:px-4 sticky top-0 z-20">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-9 w-9 shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
      <div className="relative flex-1 max-w-xl">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search notes, tags, content..."
          className="pl-9 h-9 bg-secondary/60 border-transparent focus-visible:bg-card focus-visible:border-border rounded-lg"
        />
        <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">Ctrl K</kbd>
      </div>

      <div className="flex-1" />

      {connected ? (
        <Button
          onClick={() => onConnectWallet()}
          variant="outline"
          className="h-9 rounded-lg gap-2 whitespace-nowrap shrink-0 px-2 sm:px-3 border-primary/30 bg-accent text-accent-foreground hover:bg-accent/80"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_currentColor]" />
          <span className="hidden sm:inline font-mono text-xs">{shortAddr(walletAddr!)}</span>
          <Check className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 rounded-lg gap-2 whitespace-nowrap shrink-0 px-2 sm:px-3 bg-gradient-brand text-white border-0 hover:opacity-90 shadow-soft">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Choose wallet</DropdownMenuLabel>
            {wallets.length > 0 ? (
              wallets.map((wallet) => (
                <DropdownMenuItem key={wallet.name} onClick={() => onConnectWallet(wallet.name)} className="gap-2">
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

      <ThemeToggle />

      <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings" className="rounded-full hover:bg-accent">
        <Settings className="h-[18px] w-[18px]" />
      </Button>
    </header>
  );
};
