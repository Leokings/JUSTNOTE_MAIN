import { useMemo, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/justnote/Sidebar";
import { Topbar } from "@/components/justnote/Topbar";
import { Editor } from "@/components/justnote/Editor";
import { SettingsDialog } from "@/components/justnote/SettingsDialog";
import { ThemeProvider } from "@/components/justnote/ThemeProvider";
import { Note, uid } from "@/lib/mockData";
import { toast } from "sonner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { getShelbyClient, aptosClient } from "@/lib/shelby";

const JustNoteApp = () => {
  // Start with local cache to persist across disconnects/refreshes
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem("justnote:notes");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out any blobs that were saved to cache before we added the filter
        return parsed.filter((n: Note) => !n.id.startsWith('@'));
      }
    } catch {}
    return [];
  });
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem("justnote:activeId") || null);

  // Sync state to local storage automatically
  useEffect(() => {
    localStorage.setItem("justnote:notes", JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (activeId) localStorage.setItem("justnote:activeId", activeId);
    else localStorage.removeItem("justnote:activeId");
  }, [activeId]);
  const [query, setQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [encryption, setEncryption] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { account, connected, connect, disconnect, signAndSubmitTransaction } = useWallet();
  const walletAddr = connected && account?.address ? String(account.address) : null;

  // When wallet connects, try to fetch on-chain notes (non-blocking)
  useEffect(() => {
    if (!walletAddr) return;
    let cancelled = false;

    const fetchNotes = async () => {
      try {
        const shelbyClient = await getShelbyClient();
        const blobs = await shelbyClient.coordination.getAccountBlobs({ account: walletAddr });
        if (cancelled) return;
        if (blobs && blobs.length > 0) {
          const onChainNotes: Note[] = [];
          
          blobs.forEach((b: any) => {
            // The indexer returns the full name (e.g. @0x123/n_abc) in b.name 
            // and the suffix (e.g. n_abc) in b.blobNameSuffix.
            const suffix = b.blobNameSuffix || (b.name ? b.name.split("/").pop() : null) || b.blob_name?.split("/").pop();
            
            // Ignore blobs from other apps/tutorials that don't have a valid suffix
            if (!suffix || suffix.startsWith('@')) return;

            onChainNotes.push({
              id: suffix,
              title: "Loading...",
              content: "",
              tags: ["web3"],
              folder: "Personal",
              updatedAt: b.creationMicros ? Number(b.creationMicros) / 1000 : (b.uploadTimestamp ? Number(b.uploadTimestamp) * 1000 : Date.now()),
              encrypted: false,
            });
          });
          setNotes((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newOnes = onChainNotes.filter((n) => !existingIds.has(n.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
          });
          toast.success(`Loaded ${onChainNotes.length} notes from Shelby`);
        }
      } catch (err) {
        console.warn("Could not fetch on-chain notes:", err);
        // Silently fail — the app works fine with local notes
      }
    };
    fetchNotes();
    return () => { cancelled = true; };
  }, [walletAddr]);

  // Download note content when selected (lazy loading for on-chain notes)
  const loadNoteContent = useCallback(
    async (noteId: string) => {
      if (!walletAddr) return;
      try {
        const shelbyClient = await getShelbyClient();
        const blobData = await shelbyClient.rpc.getBlob({
          account: walletAddr,
          blobName: noteId
        });
        
        if (blobData && blobData.readable) {
          let text = await new Response(blobData.readable).text();
          let isEncrypted = false;
          if (text.startsWith("[ENCRYPTED] ")) {
            // UTF-8 safe Base64 decode
            const binStr = atob(text.replace("[ENCRYPTED] ", ""));
            const bytes = Uint8Array.from(binStr, (c) => c.codePointAt(0)!);
            text = new TextDecoder().decode(bytes);
            isEncrypted = true;
          }
          setNotes((s) =>
            s.map((n) =>
              n.id === noteId
                ? {
                    ...n,
                    content: text,
                    title: text.split("\n")[0]?.slice(0, 30) || n.title,
                    encrypted: isEncrypted,
                  }
                : n
            )
          );
        }
      } catch (err) {
        console.warn("Failed to load note content:", err);
      }
    },
    [walletAddr]
  );

  useEffect(() => {
    if (!activeId || !walletAddr) return;
    const activeNote = notes.find((n) => n.id === activeId);
    // Only try to fetch content for on-chain notes (tagged "web3" and no content yet)
    if (activeNote && !activeNote.content && activeNote.tags.includes("web3")) {
      loadNoteContent(activeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, walletAddr, loadNoteContent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => (selectedFolder ? n.folder === selectedFolder : true))
      .filter((n) => (selectedTag ? n.tags.includes(selectedTag) : true))
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, query, selectedFolder, selectedTag]);

  const active = notes.find((n) => n.id === activeId) ?? null;

  const handleConnectWallet = async () => {
    if (connected) {
      disconnect();
      toast("Wallet disconnected");
    } else {
      try {
        await connect("Petra" as any);
      } catch (err: any) {
        console.error("Wallet connect error:", err);
        toast.error("Failed to connect wallet. Is Petra installed?");
      }
    }
  };

  const saveNoteOnChain = async (n: Note) => {
    if (!walletAddr || !signAndSubmitTransaction) {
      return toast.error("Connect wallet first!");
    }
    setSaving(true);
    toast.loading("Saving to Shelby…", { id: "saving" });
    try {
      let contentToSave = n.content;
      if (n.encrypted) {
        // UTF-8 safe Base64 encode
        const bytes = new TextEncoder().encode(n.content);
        const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
        contentToSave = "[ENCRYPTED] " + btoa(binStr);
      }

      const dataBytes = new TextEncoder().encode(contentToSave);

      // Dynamic import to avoid blocking app load
      const sdk = await import("@shelby-protocol/sdk/browser");
      const provider = await sdk.createDefaultErasureCodingProvider();
      const commitments = await sdk.generateCommitments(provider, dataBytes);

      const expirationMicros = BigInt(Date.now() + 30 * 24 * 3600 * 1000) * 1000n;

      const payload = sdk.ShelbyBlobClient.createRegisterBlobPayload({
        account: walletAddr,
        blobName: n.id,
        blobMerkleRoot: commitments.blob_merkle_root,
        numChunksets: sdk.expectedTotalChunksets(commitments.raw_data_size).toString(),
        expirationMicros: expirationMicros.toString(),
        blobSize: commitments.raw_data_size.toString(),
        encoding: (provider as any).config.enumIndex,
      });

      const result = await signAndSubmitTransaction({ data: payload });
      await aptosClient.waitForTransaction({ transactionHash: result.hash });

      const shelbyClient = await getShelbyClient();
      await shelbyClient.rpc.putBlob({
        account: walletAddr,
        blobName: n.id,
        blobData: dataBytes,
      });

      toast.success("Note saved to Shelby!", { id: "saving" });
      updateActive({ updatedAt: Date.now() });
    } catch (err: any) {
      console.error("Save failed:", err);
      toast.error(`Save failed: ${err.message || "Unknown error"}`, { id: "saving" });
    } finally {
      setSaving(false);
    }
  };

  const newNote = () => {
    const n: Note = {
      id: uid(),
      title: "Untitled",
      content: "",
      tags: [],
      folder: selectedFolder ?? "Personal",
      updatedAt: Date.now(),
      encrypted: encryption,
    };
    setNotes((s) => [n, ...s]);
    setActiveId(n.id);
    toast("New note created");
  };

  const updateActive = (patch: Partial<Note>) => {
    if (!active) return;
    setNotes((s) => s.map((n) => (n.id === active.id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  };

  const deleteActive = () => {
    if (!active) return;
    const id = active.id;
    setNotes((s) => s.filter((n) => n.id !== id));
    const remaining = notes.filter((n) => n.id !== id);
    setActiveId(remaining[0]?.id ?? null);
    toast("Note deleted", { description: "Removed from local state" });
  };

  const clearMockData = () => {
    setNotes([]);
    setActiveId(null);
  };

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      <Sidebar
        notes={filtered}
        activeId={activeId}
        selectedFolder={selectedFolder}
        selectedTag={selectedTag}
        onSelect={setActiveId}
        onNew={newNote}
        onSelectFolder={setSelectedFolder}
        onSelectTag={setSelectedTag}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          query={query}
          onQuery={setQuery}
          walletAddr={walletAddr}
          onConnectWallet={handleConnectWallet}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {active ? (
          <Editor
            key={active.id}
            note={active}
            walletAddr={walletAddr}
            onChange={updateActive}
            onDelete={deleteActive}
            onSaveOnChain={walletAddr ? () => saveNoteOnChain(active) : undefined}
          />
        ) : (
          <EmptyState onNew={newNote} />
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        encryption={encryption}
        onEncryption={setEncryption}
        walletAddr={walletAddr}
        onConnect={() => connect("Petra" as any)}
        onDisconnect={disconnect}
        noteCount={notes.length}
        onClearMockData={clearMockData}
      />
    </div>
  );
};

const EmptyState = ({ onNew }: { onNew: () => void }) => (
  <div className="flex-1 grid place-items-center p-10">
    <div className="text-center max-w-sm">
      <div className="h-14 w-14 rounded-2xl bg-gradient-brand mx-auto mb-5 shadow-glow grid place-items-center text-white text-2xl">✦</div>
      <h2 className="font-display text-2xl font-semibold mb-2">No note selected</h2>
      <p className="text-sm text-muted-foreground mb-5">Pick a note from the sidebar or start a fresh one. Everything you write is saved to Shelby.</p>
      <button onClick={onNew} className="bg-gradient-brand text-white text-sm px-4 py-2 rounded-lg shadow-soft hover:opacity-90">
        Create your first note
      </button>
    </div>
  </div>
);

const Index = () => (
  <ThemeProvider>
    <JustNoteApp />
  </ThemeProvider>
);

export default Index;
