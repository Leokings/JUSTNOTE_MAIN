import { Note, FOLDERS, ALL_TAGS, relTime } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline, List, ListOrdered, Quote, Code,
  Link2, Heading1, Heading2, Trash2, Lock, ShieldCheck, Cloud, Hash, Plus, ImagePlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  note: Note;
  walletAddr: string | null;
  onChange: (patch: Partial<Note>) => void;
  onDelete: (localOnly: boolean) => void;
  onSaveOnChain?: (expiryDays: number) => void;
  onHydrateMedia?: (mediaId: string) => Promise<string>;
};

export const pendingMediaCache = new Map<string, File>();

type SaveState = "idle" | "saving" | "saved";

export const Editor = ({ note, walletAddr, onChange, onDelete, onSaveOnChain, onHydrateMedia }: Props) => {
  const [save, setSave] = useState<SaveState>("saved");
  const [expiryDays, setExpiryDays] = useState("30");
  const timer = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastNoteId = useRef(note.id);

  // When switching note, sync editor DOM
  useEffect(() => {
    if (contentRef.current && lastNoteId.current !== note.id) {
      contentRef.current.innerHTML = note.content;
      lastNoteId.current = note.id;
      setSave("saved");
    }
    if (contentRef.current && contentRef.current.innerHTML !== note.content && lastNoteId.current === note.id && document.activeElement !== contentRef.current) {
      contentRef.current.innerHTML = note.content;
    }
  }, [note.id, note.content]);

  // Initial mount
  useEffect(() => {
    if (contentRef.current && contentRef.current.innerHTML === "") {
      contentRef.current.innerHTML = note.content;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate media elements
  useEffect(() => {
    if (!onHydrateMedia || !contentRef.current) return;
    
    const elements = contentRef.current.querySelectorAll('[data-shelby-media]');
    elements.forEach(async (el) => {
      const mediaId = el.getAttribute('data-shelby-media');
      const hydrated = el.getAttribute('data-hydrated');
      if (mediaId && hydrated !== "true") {
        try {
          const blobUrl = await onHydrateMedia(mediaId);
          if (blobUrl) {
            el.setAttribute('src', blobUrl);
            el.setAttribute('data-hydrated', 'true');
          }
        } catch (err) {
          console.error("Failed to hydrate media", mediaId, err);
        }
      }
    });
  }, [note.id, note.content, onHydrateMedia]);

  const triggerSave = () => {
    setSave("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSave("saved"), 700);
  };

  const exec = (cmd: string) => {
    document.execCommand(cmd, false);
    contentRef.current?.focus();
    if (contentRef.current) {
      onChange({ content: contentRef.current.innerHTML });
    }
    triggerSave();
  };

  const toggleTag = (t: string) => {
    const has = note.tags.includes(t);
    onChange({ tags: has ? note.tags.filter((x) => x !== t) : [...note.tags, t] });
    triggerSave();
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be under 5MB");
      return;
    }

    try {
      setSave("saving");
      
      // Create local preview URL
      const localUrl = URL.createObjectURL(file);
      pendingMediaCache.set(localUrl, file);
      
      // Inject into editor based on type
      let html = "";
      if (file.type.startsWith("image/")) {
        html = `<img src="${localUrl}" style="max-width:100%; border-radius:8px; margin:16px 0;" alt="Uploaded image" />`;
      } else if (file.type.startsWith("video/")) {
        html = `<video src="${localUrl}" controls style="max-width:100%; border-radius:8px; margin:16px 0;"></video>`;
      } else if (file.type.startsWith("audio/")) {
        html = `<audio src="${localUrl}" controls style="width:100%; margin:16px 0;"></audio>`;
      }

      if (html) {
        contentRef.current?.focus();
        document.execCommand("insertHTML", false, html + "<p><br></p>");
        if (contentRef.current) {
          onChange({ content: contentRef.current.innerHTML });
        }
        triggerSave();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to attach media");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSave("saved");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[hsl(var(--editor-bg))] min-w-0">
      {/* Status bar */}
      <div className="h-11 shrink-0 px-4 md:px-6 flex items-center gap-3 border-b border-border/60 text-xs text-muted-foreground overflow-x-auto scrollbar-none whitespace-nowrap">
        <Badge>
          <Cloud className="h-3 w-3" />
          {save === "saving" ? "Saving to Shelby…" : save === "saved" ? "Saved to Shelby" : "Idle"}
          {save !== "saving" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ml-1" />}
        </Badge>
        {note.encrypted && (
          <Badge>
            <Lock className="h-3 w-3" /> Encrypted
          </Badge>
        )}
        {walletAddr && (
          <Badge>
            <ShieldCheck className="h-3 w-3 text-primary" /> You own this note
          </Badge>
        )}
        <div className="flex-1" />
        <span className="hidden sm:inline">Updated {relTime(note.updatedAt)}</span>
        {onSaveOnChain && (
          <div className="flex items-center gap-1.5">
            <Select value={expiryDays} onValueChange={setExpiryDays}>
              <SelectTrigger className="h-7 w-[100px] text-xs bg-background/50 border-border/60">
                <SelectValue placeholder="Expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Day</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="365">1 Year</SelectItem>
                <SelectItem value="3650">10 Years</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => onSaveOnChain(Number(expiryDays))} className="h-7 px-2 bg-gradient-brand text-white border-none shadow-glow">
              Save On-Chain
            </Button>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDelete(true)}>
              Delete Local Copy
            </DropdownMenuItem>
            {walletAddr && (
              <DropdownMenuItem onClick={() => onDelete(false)} className="text-destructive">
                Delete Everywhere (Shelby)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Toolbar */}
      <div className="h-11 shrink-0 px-6 flex items-center gap-1 border-b border-border/60 overflow-x-auto scrollbar-thin">
        <ToolBtn onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("formatBlock")}><Heading1 className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock")}><Heading2 className="h-3.5 w-3.5" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock")}><Quote className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock")}><Code className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("createLink")}><Link2 className="h-3.5 w-3.5" /></ToolBtn>
        <Sep />
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*,video/mp4,audio/mp3,audio/mpeg" 
          onChange={handleFileSelect} 
        />
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => fileInputRef.current?.click()} 
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> Attach
        </Button>

        <div className="flex-1" />

        {/* Folder selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
              📁 {note.folder}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FOLDERS.map((f) => (
              <DropdownMenuItem key={f} onClick={() => { onChange({ folder: f }); triggerSave(); }}>
                {f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tag manager */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="h-3 w-3 mr-1" /> Tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_TAGS.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={note.tags.includes(t)}
                onCheckedChange={() => toggleTag(t)}
              >
                #{t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editor surface */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-8 md:px-14 py-10">
          <input
            value={note.title}
            onChange={(e) => { onChange({ title: e.target.value }); triggerSave(); }}
            placeholder="Untitled"
            className="w-full font-display text-4xl md:text-5xl font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
          />

          {/* Tags row */}
          {note.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground inline-flex items-center gap-1">
                  <Hash className="h-2.5 w-2.5" />{t}
                  <button
                    onClick={() => toggleTag(t)}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                    aria-label={`remove ${t}`}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Start writing… your thoughts are stored on Shelby, encrypted, and yours."
            onInput={(e) => { onChange({ content: (e.target as HTMLDivElement).innerHTML }); triggerSave(); }}
            onPaste={(e) => {
              e.preventDefault();
              if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                return; // Block pasting images/files
              }
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            onDrop={(e) => {
              e.preventDefault(); // Block drag and drop
            }}
            className={cn(
              "mt-6 min-h-[400px] outline-none text-base leading-relaxed text-foreground/90 whitespace-pre-wrap",
              "prose prose-sm max-w-none"
            )}
          />
        </div>
      </div>
    </div>
  );
};

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary text-foreground/70 text-[11px] font-medium whitespace-nowrap shrink-0">
    {children}
  </span>
);

const ToolBtn = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
  >
    {children}
  </button>
);

const Sep = () => <span className="h-4 w-px bg-border mx-1" />;
