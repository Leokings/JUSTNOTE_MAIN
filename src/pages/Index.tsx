import { useMemo, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/justnote/Sidebar";
import { Topbar } from "@/components/justnote/Topbar";
import { Editor, pendingMediaCache } from "@/components/justnote/Editor";
import { SettingsDialog } from "@/components/justnote/SettingsDialog";
import { ThemeProvider } from "@/components/justnote/ThemeProvider";
import { Note, uid } from "@/lib/mockData";
import { toast } from "sonner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { getShelbyClient, aptosClient } from "@/lib/shelby";
import { cn } from "@/lib/utils";
import { AES_PREFIX, AES_PREFIX_BYTES, deriveMasterKey, encryptData, decryptData } from "@/lib/encryption";

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
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);

  const { account, connected, connect, disconnect, signAndSubmitTransaction, signMessage } = useWallet();
  const walletAddr = connected && account?.address ? String(account.address) : null;

  const requireEncryptionKey = async (): Promise<CryptoKey> => {
    if (aesKey) return aesKey;
    if (!walletAddr || !signMessage) throw new Error("Wallet not connected");

    toast.loading("Please sign the message to unlock your encryption key...", { id: "crypto" });
    try {
      const response = await signMessage({
        message: "JustNote Master Encryption Key Generator. Sign this to securely derive your AES-256 decryption key.",
        nonce: "justnote-v1",
      });
      
      const sigStr = typeof response.signature === 'string' ? response.signature : Array.from(response.signature || []).map(b => b.toString(16).padStart(2, '0')).join('');
      const key = await deriveMasterKey(sigStr);
      setAesKey(key);
      toast.success("Encryption Key Unlocked!", { id: "crypto" });
      return key;
    } catch (err: any) {
      toast.error("Signature rejected. Cannot unlock notes.", { id: "crypto" });
      throw err;
    }
  };

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
          let bytes = new Uint8Array(await new Response(blobData.readable).arrayBuffer());
          let text = "";
          let isEncrypted = false;

          const headerStr = new TextDecoder().decode(bytes.slice(0, AES_PREFIX_BYTES.length));
          if (headerStr === AES_PREFIX) {
             const key = await requireEncryptionKey();
             const plaintextBytes = await decryptData(bytes.slice(AES_PREFIX_BYTES.length), key);
             text = new TextDecoder().decode(plaintextBytes);
             isEncrypted = true;
          } else {
             text = new TextDecoder().decode(bytes);
             // Backwards compatibility for Base64 encrypted notes
             if (text.startsWith("[ENCRYPTED] ")) {
                const binStr = atob(text.replace("[ENCRYPTED] ", ""));
                const decBytes = Uint8Array.from(binStr, (c) => c.codePointAt(0)!);
                text = new TextDecoder().decode(decBytes);
                isEncrypted = true;
             }
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

  const saveNoteOnChain = async (n: Note, expiryDays: number = 30) => {
    if (!walletAddr || !signAndSubmitTransaction) {
      return toast.error("Connect wallet first!");
    }
    setSaving(true);
    toast.loading("Saving to Shelby…", { id: "saving" });
    try {
      let finalContent = n.content;
      console.log("Saving finalContent:", finalContent);
      console.log("Pending Cache Keys:", Array.from(pendingMediaCache.keys()));

      // --- BATCH MEDIA UPLOAD ---
      const parser = new DOMParser();
      const doc = parser.parseFromString(finalContent, "text/html");
      const localMediaElements = doc.querySelectorAll('img[src^="blob:"], video[src^="blob:"], audio[src^="blob:"]');

      for (let i = 0; i < localMediaElements.length; i++) {
        const el = localMediaElements[i];
        const srcUrl = el.getAttribute("src");
        if (srcUrl && pendingMediaCache.has(srcUrl)) {
          const file = pendingMediaCache.get(srcUrl)!;
          try {
            const mediaId = await uploadMediaOnChain(file, n.encrypted);
            el.setAttribute("data-shelby-media", mediaId);
            pendingMediaCache.delete(srcUrl);
          } catch (uploadErr) {
            console.error("Failed to upload a media file, skipping it:", uploadErr);
            throw new Error("A media file failed to upload. Check your wallet balance or try again.");
          }
        }
      }

      // Re-serialize the HTML after modifications
      finalContent = doc.body.innerHTML;

      let dataBytes = new TextEncoder().encode(finalContent);
      if (n.encrypted) {
        const key = await requireEncryptionKey();
        const ciphertext = await encryptData(dataBytes, key);
        dataBytes = new Uint8Array(AES_PREFIX_BYTES.length + ciphertext.length);
        dataBytes.set(AES_PREFIX_BYTES, 0);
        dataBytes.set(ciphertext, AES_PREFIX_BYTES.length);
      }

      // Dynamic import to avoid blocking app load
      const sdk = await import("@shelby-protocol/sdk/browser");
      const provider = await sdk.createDefaultErasureCodingProvider();
      const commitments = await sdk.generateCommitments(provider, dataBytes);

      const expirationMicros = BigInt(Date.now() + expiryDays * 24 * 3600 * 1000) * 1000n;

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
      updateActive({ content: finalContent, updatedAt: Date.now() });
    } catch (err: any) {
      console.error("Save failed:", err);
      toast.error(`Save failed: ${err.message || "Unknown error"}`, { id: "saving" });
    } finally {
      setSaving(false);
    }
  };

  const uploadMediaOnChain = async (file: File, isEncrypted: boolean): Promise<string> => {
    if (!walletAddr || !signAndSubmitTransaction) {
      throw new Error("Connect wallet first!");
    }
    const mediaId = `${activeId}_media_${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          toast.loading("Uploading media to Shelby…", { id: "media-upload" });
          const dataUrl = reader.result as string;
          let dataBytes = new TextEncoder().encode(dataUrl);
          
          if (isEncrypted) {
            const key = await requireEncryptionKey();
            const ciphertext = await encryptData(dataBytes, key);
            dataBytes = new Uint8Array(AES_PREFIX_BYTES.length + ciphertext.length);
            dataBytes.set(AES_PREFIX_BYTES, 0);
            dataBytes.set(ciphertext, AES_PREFIX_BYTES.length);
          }
          
          const sdk = await import("@shelby-protocol/sdk/browser");
          const provider = await sdk.createDefaultErasureCodingProvider();
          const commitments = await sdk.generateCommitments(provider, dataBytes);

          const expirationMicros = BigInt(Date.now() + 30 * 24 * 3600 * 1000) * 1000n;

          const payload = sdk.ShelbyBlobClient.createRegisterBlobPayload({
            account: walletAddr,
            blobName: mediaId,
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
            blobName: mediaId,
            blobData: dataBytes,
          });

          toast.success("Media uploaded to Shelby!", { id: "media-upload" });
          resolve(mediaId);
        } catch (err: any) {
          console.error("Media upload failed:", err);
          toast.error(`Upload failed: ${err.message || "Unknown error"}`, { id: "media-upload" });
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  };

  const hydrateMedia = async (mediaId: string): Promise<string> => {
    if (!walletAddr) throw new Error("No wallet");
    const shelbyClient = await getShelbyClient();
    const blobData = await shelbyClient.rpc.getBlob({
      account: walletAddr,
      blobName: mediaId
    });
    if (!blobData || !blobData.readable) throw new Error("No data readable");
    
    let bytes = new Uint8Array(await new Response(blobData.readable).arrayBuffer());
    let text = "";
    
    const headerStr = new TextDecoder().decode(bytes.slice(0, AES_PREFIX_BYTES.length));
    if (headerStr === AES_PREFIX) {
      const key = await requireEncryptionKey();
      const plaintextBytes = await decryptData(bytes.slice(AES_PREFIX_BYTES.length), key);
      text = new TextDecoder().decode(plaintextBytes);
    } else {
      text = new TextDecoder().decode(bytes);
      if (text.startsWith("[ENCRYPTED] ")) {
        text = atob(text.replace("[ENCRYPTED] ", ""));
      }
    }
    
    const res = await fetch(text);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
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

  const deleteActive = async (localOnly: boolean = false) => {
    if (!active) return;
    const n = active;

    if (walletAddr && signAndSubmitTransaction && !localOnly) {
      try {
        toast.loading("Deleting from Shelby...", { id: "deleting" });
        const sdk = await import("@shelby-protocol/sdk/browser");
        
        // Scan for media blobs
        const parser = new DOMParser();
        const doc = parser.parseFromString(n.content, "text/html");
        const mediaElements = doc.querySelectorAll("[data-shelby-media]");
        
        for (let i = 0; i < mediaElements.length; i++) {
          const mediaId = mediaElements[i].getAttribute("data-shelby-media");
          if (mediaId) {
            const payload = sdk.ShelbyBlobClient.createDeleteBlobPayload({
              account: walletAddr,
              blobName: mediaId,
            });
            const result = await signAndSubmitTransaction({ data: payload });
            await aptosClient.waitForTransaction({ transactionHash: result.hash });
          }
        }

        // Delete text blob
        const textPayload = sdk.ShelbyBlobClient.createDeleteBlobPayload({
          account: walletAddr,
          blobName: n.id,
        });
        const result = await signAndSubmitTransaction({ data: textPayload });
        await aptosClient.waitForTransaction({ transactionHash: result.hash });

        toast.success("Permanently deleted from Shelby!", { id: "deleting" });
      } catch (err: any) {
        console.error("Delete failed", err);
        toast.error("Failed to delete from Shelby: " + (err.message || "Unknown error"), { id: "deleting" });
        return; // Halt local deletion so they don't lose the local copy if on-chain delete fails
      }
    }

    setNotes((s) => s.filter((note) => note.id !== n.id));
    const remaining = notes.filter((note) => note.id !== n.id);
    setActiveId(remaining[0]?.id ?? null);
    if (!walletAddr) toast("Note removed from local state");
  };

  const clearMockData = () => {
    setNotes([]);
    setActiveId(null);
  };

  const isMobileEditorOpen = activeId !== null;

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      <Sidebar
        className={cn(isMobileEditorOpen ? "hidden md:flex md:w-72" : "w-full md:w-72")}
        notes={filtered}
        activeId={activeId}
        selectedFolder={selectedFolder}
        selectedTag={selectedTag}
        onSelect={setActiveId}
        onNew={newNote}
        onSelectFolder={setSelectedFolder}
        onSelectTag={setSelectedTag}
      />

      <div className={cn("flex-1 flex flex-col min-w-0", !isMobileEditorOpen ? "hidden md:flex" : "flex")}>
        <Topbar
          query={query}
          onQuery={setQuery}
          walletAddr={walletAddr}
          onConnectWallet={handleConnectWallet}
          onOpenSettings={() => setSettingsOpen(true)}
          onBack={isMobileEditorOpen ? () => setActiveId(null) : undefined}
        />

        {active ? (
          <Editor
            key={active.id}
            note={active}
            walletAddr={walletAddr}
            onChange={updateActive}
            onDelete={deleteActive}
            onSaveOnChain={walletAddr ? (days) => saveNoteOnChain(active, days) : undefined}
            onUploadMedia={uploadMediaOnChain}
            onHydrateMedia={hydrateMedia}
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
