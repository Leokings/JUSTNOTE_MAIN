import { useMemo, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/justnote/Sidebar";
import { Topbar } from "@/components/justnote/Topbar";
import { Editor } from "@/components/justnote/Editor";
import { SettingsDialog } from "@/components/justnote/SettingsDialog";
import { ThemeProvider } from "@/components/justnote/ThemeProvider";
import { Note, uid } from "@/lib/notes";
import { toast } from "sonner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { getShelbyClient, aptosClient } from "@/lib/shelby";
import { cn } from "@/lib/utils";
import { AES_PREFIX, AES_PREFIX_BYTES, deriveMasterKey, encryptData, decryptData } from "@/lib/encryption";
import { pendingMediaCache } from "@/lib/pendingMediaCache";
import { createNotePackage, readNotePackage, type NotePackageAsset } from "@/lib/notePackage";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import type { BlobMetadata } from "@shelby-protocol/sdk/browser";

type ShelbyBlobIndexMetadata = BlobMetadata & {
  uploadTimestamp?: number | string;
  blob_name?: string;
};

const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : "Unknown error");
const NOTE_ID_PATTERN = /^n_[a-z0-9]{8}$/;

const extensionFromMime = (mime: string, fallback = "bin") => {
  const normalized = mime.toLowerCase().split(";")[0];
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
  };
  return known[normalized] || normalized.split("/")[1]?.replace(/[^a-z0-9]/g, "") || fallback;
};

const assetElementSelector = "img, video, audio";

const JustNoteApp = () => {
  // Start with local cache to persist across disconnects/refreshes
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem("justnote:notes");
      if (saved) {
        const parsed = JSON.parse(saved) as Note[];
        // Filter out any blobs that were saved to cache before we added the filter
        return Array.isArray(parsed) ? parsed.filter((n) => !n.id.startsWith("@")) : [];
      }
    } catch (err) {
      console.warn("Could not read cached notes:", err);
    }
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

  const requireEncryptionKey = useCallback(async (): Promise<CryptoKey> => {
    if (aesKey) return aesKey;
    if (!walletAddr || !signMessage) throw new Error("Wallet not connected");

    toast.loading("Please sign the message to unlock your encryption key...", { id: "crypto" });
    try {
      const response = await signMessage({
        message: "JustNote Master Encryption Key Generator. Sign this to securely derive your AES-256 decryption key.",
        nonce: "justnote-v1",
      });
      
      const sigStr = String(response.signature);
      const key = await deriveMasterKey(sigStr);
      setAesKey(key);
      toast.success("Encryption Key Unlocked!", { id: "crypto" });
      return key;
    } catch (err) {
      toast.error("Signature rejected. Cannot unlock notes.", { id: "crypto" });
      throw err;
    }
  }, [aesKey, signMessage, walletAddr]);

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
          
          blobs.forEach((b: ShelbyBlobIndexMetadata) => {
            // The indexer returns the full name (e.g. @0x123/n_abc) in b.name 
            // and the suffix (e.g. n_abc) in b.blobNameSuffix.
            const fullName = String(b.name || "");
            const suffix = b.blobNameSuffix || (fullName ? fullName.split("/").pop() : null) || b.blob_name?.split("/").pop();
            
            // Only index current Just Note package blobs.
            if (!suffix || suffix.startsWith("@") || !NOTE_ID_PATTERN.test(suffix)) return;

            onChainNotes.push({
              id: suffix,
              title: "Loading...",
              subtitle: "",
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
        // Silently fail; the app works fine with local notes.
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
          const bytes = new Uint8Array(await new Response(blobData.readable).arrayBuffer());
          let payloadBytes = bytes;
          let isEncrypted = false;

          const headerStr = new TextDecoder().decode(bytes.slice(0, AES_PREFIX_BYTES.length));
          if (headerStr === AES_PREFIX) {
            const key = await requireEncryptionKey();
            const plaintextBytes = await decryptData(bytes.slice(AES_PREFIX_BYTES.length), key);
            payloadBytes = plaintextBytes;
            isEncrypted = true;
          }
          const storedNote = readNotePackage(payloadBytes);
          if (!storedNote) {
            toast.error("This note uses an older storage format. Re-save it to upgrade the bundle.");
            return;
          }

          setNotes((s) =>
            s.map((n) => {
              if (n.id !== noteId) return n;

              return {
                ...n,
                title: storedNote.title,
                subtitle: storedNote.subtitle,
                content: storedNote.content,
                tags: storedNote.tags,
                folder: storedNote.folder,
                updatedAt: storedNote.updatedAt,
                encrypted: isEncrypted,
              };
            })
          );
        }
      } catch (err) {
        console.warn("Failed to load note content:", err);
      }
    },
    [requireEncryptionKey, walletAddr]
  );

  useEffect(() => {
    if (!activeId || !walletAddr) return;
    const activeNote = notes.find((n) => n.id === activeId);
    // Fetch Shelby notes when content is missing or bundled asset URLs need to be regenerated.
    if (activeNote && activeNote.tags.includes("web3") && (!activeNote.content || activeNote.content.includes("data-justnote-asset"))) {
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
          (n.subtitle || "").toLowerCase().includes(q) ||
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
        await connect("Petra");
      } catch (err) {
        console.error("Wallet connect error:", err);
        toast.error("Failed to connect wallet. Is Petra installed?");
      }
    }
  };

  const bundleMediaAssets = async (doc: Document): Promise<NotePackageAsset[]> => {
    const assets: NotePackageAsset[] = [];
    const mediaElements = Array.from(doc.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>(assetElementSelector));

    for (const el of mediaElements) {
      const originalSrc = el.getAttribute("src") || "";
      const source = originalSrc;
      let blob: Blob | null = null;
      let name = "";

      if (source && pendingMediaCache.has(source)) {
        const file = pendingMediaCache.get(source)!;
        blob = file;
        name = file.name;
      } else {
        try {
          if (source && !source.startsWith("http")) {
            const response = await fetch(source);
            blob = await response.blob();
          }
        } catch (err) {
          console.warn("Could not bundle media asset:", err);
        }
      }

      if (!blob) continue;

      const mime = blob.type || el.getAttribute("data-justnote-mime") || "application/octet-stream";
      const ext = extensionFromMime(mime, name.split(".").pop() || "bin");
      const path = `assets/media-${String(assets.length + 1).padStart(3, "0")}.${ext}`;
      const data = new Uint8Array(await blob.arrayBuffer());

      el.setAttribute("src", path);
      el.setAttribute("data-justnote-asset", path);
      el.setAttribute("data-justnote-mime", mime);

      if (originalSrc && pendingMediaCache.has(originalSrc)) {
        pendingMediaCache.delete(originalSrc);
      }

      assets.push({
        path,
        type: el.tagName.toLowerCase(),
        mime,
        name,
        data,
      });
    }

    return assets;
  };

  const saveNoteOnChain = async (n: Note, expiryDays: number = 30) => {
    if (!walletAddr || !signAndSubmitTransaction) {
      toast.error("Connect wallet first!");
      return;
    }
    const ownerAddress = AccountAddress.fromString(walletAddr);
    setSaving(true);
    toast.loading("Saving to Shelby...", { id: "saving" });
    try {
      let finalContent = n.content;

      const parser = new DOMParser();
      const doc = parser.parseFromString(finalContent, "text/html");
      const bundledAssets = await bundleMediaAssets(doc);

      // Re-serialize the HTML after modifications
      finalContent = doc.body.innerHTML;

      const savedAt = Date.now();
      const packageBytes = createNotePackage(n, finalContent, savedAt, bundledAssets);
      const previewContent = readNotePackage(packageBytes)?.content || n.content;
      let dataBytes = packageBytes;
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
        account: ownerAddress,
        blobName: n.id,
        blobMerkleRoot: commitments.blob_merkle_root,
        numChunksets: sdk.expectedTotalChunksets(commitments.raw_data_size),
        expirationMicros: Number(expirationMicros),
        blobSize: commitments.raw_data_size,
        encoding: provider.config.enumIndex,
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
      setNotes((s) => s.map((note) => (note.id === n.id ? { ...note, content: previewContent, updatedAt: savedAt } : note)));
    } catch (err) {
      console.error("Save failed:", err);
      toast.error(`Save failed: ${getErrorMessage(err)}`, { id: "saving" });
    } finally {
      setSaving(false);
    }
  };

  const newNote = () => {
    const n: Note = {
      id: uid(),
      title: "Untitled",
      subtitle: "",
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

        const textPayload = sdk.ShelbyBlobClient.createDeleteBlobPayload({
          blobName: n.id,
        });
        const result = await signAndSubmitTransaction({ data: textPayload });
        await aptosClient.waitForTransaction({ transactionHash: result.hash });

        toast.success("Permanently deleted from Shelby!", { id: "deleting" });
      } catch (err) {
        console.error("Delete failed", err);
        toast.error(`Failed to delete from Shelby: ${getErrorMessage(err)}`, { id: "deleting" });
        return; // Halt local deletion so they don't lose the local copy if on-chain delete fails
      }
    }

    setNotes((s) => s.filter((note) => note.id !== n.id));
    const remaining = notes.filter((note) => note.id !== n.id);
    setActiveId(remaining[0]?.id ?? null);
    if (!walletAddr) toast("Note removed from local state");
  };

  const resetWorkspace = () => {
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
            saving={saving}
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
        onConnect={() => connect("Petra")}
        onDisconnect={disconnect}
        noteCount={notes.length}
        onResetWorkspace={resetWorkspace}
      />
    </div>
  );
};

const EmptyState = ({ onNew }: { onNew: () => void }) => (
  <div className="flex-1 grid place-items-center p-10">
    <div className="text-center max-w-sm">
      <div className="h-14 w-14 rounded-lg bg-gradient-brand mx-auto mb-5 shadow-glow grid place-items-center text-white text-2xl">+</div>
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
