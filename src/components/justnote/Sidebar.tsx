import { Note, FOLDERS, ALL_TAGS, previewOf, relTime } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, FolderClosed, Tag, Lock, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

type Props = {
  notes: Note[];
  activeId: string | null;
  selectedFolder: string | null;
  selectedTag: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSelectFolder: (f: string | null) => void;
  onSelectTag: (t: string | null) => void;
  className?: string;
};

export const Sidebar = ({
  notes, activeId, selectedFolder, selectedTag,
  onSelect, onNew, onSelectFolder, onSelectTag, className
}: Props) => {
  return (
    <aside className={cn("shrink-0 border-r border-border bg-[hsl(var(--sidebar-bg))] flex flex-col h-full", className)}>
      {/* Logo */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <img
          src={logoUrl}
          alt="JustNote logo"
          className="h-9 w-9 rounded-lg shadow-glow object-cover"
        />
        <div className="flex flex-col leading-tight">
          <span className="font-display text-lg font-semibold">JustNote</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">on shelby</span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Button onClick={onNew} className="w-full bg-gradient-brand text-white hover:opacity-90 shadow-soft border-0 h-9">
          <Plus className="h-4 w-4 mr-1.5" /> New Note
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 scrollbar-thin">
        {/* Folders */}
        <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FolderClosed className="h-3 w-3" /> Folders
        </div>
        <div className="mb-3 space-y-0.5">
          <FolderItem label="All notes" active={selectedFolder === null && selectedTag === null} count={notes.length} onClick={() => { onSelectFolder(null); onSelectTag(null); }} />
          {FOLDERS.map((f) => (
            <FolderItem
              key={f}
              label={f}
              active={selectedFolder === f}
              count={notes.filter((n) => n.folder === f).length}
              onClick={() => { onSelectFolder(selectedFolder === f ? null : f); onSelectTag(null); }}
            />
          ))}
        </div>

        {/* Tags */}
        <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Tags
        </div>
        <div className="px-2 mb-3 flex flex-wrap gap-1.5">
          {ALL_TAGS.map((t) => {
            const active = selectedTag === t;
            return (
              <button
                key={t}
                onClick={() => { onSelectTag(active ? null : t); onSelectFolder(null); }}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1",
                  active
                    ? "bg-gradient-brand text-white border-transparent shadow-soft"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                <Hash className="h-2.5 w-2.5" />{t}
              </button>
            );
          })}
        </div>

        {/* Notes list */}
        <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notes
        </div>
        <div className="space-y-1 pb-4">
          {notes.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-6 text-center">No notes match.</div>
          )}
          {notes.map((n) => {
            const active = n.id === activeId;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all group",
                  active
                    ? "bg-card shadow-soft ring-1 ring-primary/20"
                    : "hover:bg-accent/60"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {n.encrypted && <Lock className="h-3 w-3 text-primary shrink-0" />}
                  <span className="text-sm font-medium truncate flex-1">{n.title || "Untitled"}</span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {previewOf(n.content) || "Empty note"}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-1 uppercase tracking-wide">
                  {relTime(n.updatedAt)} · {n.folder}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
};

const FolderItem = ({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors",
      active ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80 hover:bg-accent/60"
    )}
  >
    <span className="flex items-center gap-2">
      <FolderClosed className="h-3.5 w-3.5 opacity-70" />
      {label}
    </span>
    <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
  </button>
);
