import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Wallet, Loader2 } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { ThemeProvider } from "@/components/justnote/ThemeProvider";

const HomepageInner = () => {
  const { connect, connected } = useWallet();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect("Petra");
    } catch (err) {
      console.error("Wallet connect failed:", err);
    } finally {
      setConnecting(false);
    }
  };

  // If already connected, this component won't render (App.tsx handles routing)
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-foreground relative overflow-hidden px-6">
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Logo */}
        <div className="relative group">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-brand opacity-20 blur-xl group-hover:opacity-30 transition-opacity duration-500" />
          <img
            src={logoUrl}
            alt="JustNote logo"
            className="relative h-28 w-28 rounded-lg shadow-glow object-cover"
          />
        </div>

        {/* Title */}
        <div className="text-center space-y-3">
          <h1 className="font-display text-5xl md:text-6xl font-bold">
            Just<span className="bg-gradient-brand bg-clip-text text-transparent">Note</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-md mx-auto leading-relaxed">
            Decentralized notes you truly own.
            <br />
            <span className="text-sm opacity-70">Encrypted, portable, and stored on Shelby.</span>
          </p>
        </div>

        {/* Connect Wallet Button */}
        <button
          onClick={handleConnect}
          disabled={connecting || connected}
          className="mt-4 inline-flex items-center gap-3 bg-gradient-brand text-white text-base font-medium px-8 py-3.5 rounded-lg shadow-glow hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {connecting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="h-5 w-5" />
              Connect Wallet
            </>
          )}
        </button>

        {/* Subtle footer */}
        <p className="text-[11px] text-muted-foreground/50 mt-6">
          Powered by <span className="font-medium text-muted-foreground/70">Shelby Protocol</span> on Aptos
        </p>
      </div>
    </div>
  );
};

const Homepage = () => (
  <ThemeProvider>
    <HomepageInner />
  </ThemeProvider>
);

export default Homepage;
