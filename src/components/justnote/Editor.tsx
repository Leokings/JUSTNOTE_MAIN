import { Note, FOLDERS, ALL_TAGS, relTime } from "@/lib/notes";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline, List, ListOrdered, Quote, Code,
  Link2, Heading1, Heading2, Trash2, Lock, ShieldCheck, Hash, Plus, ImagePlus,
  FolderClosed, X, Minus, ArrowUp, ArrowDown,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { pendingMediaCache } from "@/lib/pendingMediaCache";

type Props = {
  note: Note;
  walletAddr: string | null;
  onChange: (patch: Partial<Note>) => void;
  onDelete: (localOnly: boolean) => void;
  onSaveOnChain?: (expiryDays: number) => Promise<void> | void;
  saving?: boolean;
};

type SaveState = "idle" | "saving" | "saved";
type MediaSelection = {
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export const Editor = ({ note, walletAddr, onChange, onDelete, onSaveOnChain, saving = false }: Props) => {
  const [save, setSave] = useState<SaveState>("saved");
  const [expiryDays, setExpiryDays] = useState("30");
  const [mediaSelection, setMediaSelection] = useState<MediaSelection | null>(null);
  const timer = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleRef = useRef<HTMLTextAreaElement | null>(null);
  const draggedMediaRef = useRef<HTMLElement | null>(null);
  const lastNoteId = useRef(note.id);
  const isEditorEffectivelyEmpty = () => {
    const editor = contentRef.current;
    if (!editor) return true;
    return !editor.textContent?.trim() && !editor.querySelector("img, video, audio, hr");
  };
  const getSerializableEditorHtml = () => {
    if (!contentRef.current) return "";
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>(".justnote-media-block.is-selected").forEach((block) => {
      block.classList.remove("is-selected");
    });
    return clone.innerHTML;
  };
  const articleStats = useMemo(() => {
    const text = [note.title, note.subtitle, note.content.replace(/<[^>]*>/g, " ")]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const words = text ? text.split(" ").length : 0;
    const images = (note.content.match(/<img\b/gi) || []).length;
    return {
      words,
      images,
      readMinutes: Math.max(1, Math.ceil(words / 225)),
    };
  }, [note.content, note.subtitle, note.title]);

  // When switching note, sync editor DOM
  useEffect(() => {
    if (contentRef.current && lastNoteId.current !== note.id) {
      contentRef.current.innerHTML = note.content;
      lastNoteId.current = note.id;
      setSave("saved");
      setMediaSelection(null);
    }
    const editor = contentRef.current;
    const activeElement = document.activeElement;
    const editorFocused = Boolean(editor && activeElement && editor.contains(activeElement));
    const editorHtml = getSerializableEditorHtml();
    const fetchedIntoEmptyEditor = isEditorEffectivelyEmpty() && note.content.trim() !== "";

    if (editor && editorHtml !== note.content && lastNoteId.current === note.id && (!editorFocused || fetchedIntoEmptyEditor)) {
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

  const triggerSave = () => {
    setSave("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSave("saved"), 700);
  };

  const syncEditorContent = () => {
    if (!contentRef.current) return;
    onChange({ content: getSerializableEditorHtml() });
    triggerSave();
  };

  const resizeTextarea = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    resizeTextarea(titleRef.current);
    resizeTextarea(subtitleRef.current);
  }, [note.id, note.subtitle, note.title]);

  const exec = (cmd: string, value = "") => {
    document.execCommand(cmd, false, value);
    contentRef.current?.focus();
    syncEditorContent();
  };

  const createLink = () => {
    const url = window.prompt("Paste a link");
    if (!url) return;

    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", normalized);
  };

  const saveOnChain = async () => {
    if (!onSaveOnChain) return;
    setSave("saving");
    await onSaveOnChain(Number(expiryDays));
    setSave("saved");
  };

  const toggleTag = (t: string) => {
    const has = note.tags.includes(t);
    onChange({ tags: has ? note.tags.filter((x) => x !== t) : [...note.tags, t] });
    triggerSave();
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getMediaBlocks = () =>
    Array.from(contentRef.current?.querySelectorAll<HTMLElement>(".justnote-media-block") || []);

  const setSelectedMediaBlock = (block: HTMLElement | null) => {
    const blocks = getMediaBlocks();
    blocks.forEach((item) => item.classList.toggle("is-selected", item === block));

    if (!block) {
      setMediaSelection(null);
      return;
    }

    const index = blocks.indexOf(block);
    if (index < 0) {
      setMediaSelection(null);
      return;
    }

    setMediaSelection({
      index,
      canMoveUp: Boolean(block.previousElementSibling),
      canMoveDown: Boolean(block.nextElementSibling),
    });
  };

  const moveCaretToStart = (element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const syncMediaBlocks = () => {
    const editor = contentRef.current;
    if (!editor) return;

    editor.querySelectorAll<HTMLElement>(".justnote-media-block").forEach((block) => {
      block.draggable = true;
      block.tabIndex = 0;
      block.setAttribute("aria-label", "Media block");
      block.querySelectorAll<HTMLElement>("img, video, audio").forEach((media) => {
        media.draggable = false;
      });
      block.querySelectorAll<HTMLElement>("figcaption").forEach((caption) => {
        caption.contentEditable = "true";
      });
    });
  };

  useEffect(() => {
    syncMediaBlocks();
    setMediaSelection((current) => {
      const blocks = getMediaBlocks();
      blocks.forEach((block, index) => block.classList.toggle("is-selected", current?.index === index));
      if (!current) return current;

      const block = blocks[current.index];
      if (!block) return null;

      return {
        index: current.index,
        canMoveUp: Boolean(block.previousElementSibling),
        canMoveDown: Boolean(block.nextElementSibling),
      };
    });
  }, [note.id, note.content]);

  const isSupportedMedia = (file: File) =>
    file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");

  const insertMediaBlock = (file: File, localUrl: string) => {
    const editor = contentRef.current;
    if (!editor) return;

    const figure = document.createElement("figure");
    figure.draggable = true;
    figure.tabIndex = 0;
    figure.className = "justnote-media-block";

    let media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null = null;
    if (file.type.startsWith("image/")) {
      media = document.createElement("img");
      media.alt = file.name || "Uploaded image";
    } else if (file.type.startsWith("video/")) {
      media = document.createElement("video");
      media.controls = true;
    } else if (file.type.startsWith("audio/")) {
      media = document.createElement("audio");
      media.controls = true;
    }

    if (!media) return;
    media.src = localUrl;
    media.draggable = false;
    figure.appendChild(media);

    const caption = document.createElement("figcaption");
    caption.contentEditable = "true";
    caption.dataset.placeholder = "Write a caption...";
    figure.appendChild(caption);

    const afterMedia = document.createElement("p");
    afterMedia.innerHTML = "<br>";

    editor.focus();
    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : document.createRange();

    if (!editor.contains(range.startContainer)) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(figure);
    fragment.appendChild(afterMedia);
    range.insertNode(fragment);
    moveCaretToStart(afterMedia);

    syncEditorContent();
    setSelectedMediaBlock(figure);
  };

  const insertDivider = () => {
    const editor = contentRef.current;
    if (!editor) return;

    const divider = document.createElement("hr");
    divider.className = "justnote-divider";
    const afterDivider = document.createElement("p");
    afterDivider.innerHTML = "<br>";

    editor.focus();
    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : document.createRange();

    if (!editor.contains(range.startContainer)) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(divider);
    fragment.appendChild(afterDivider);
    range.insertNode(fragment);
    moveCaretToStart(afterDivider);

    syncEditorContent();
  };

  const attachMediaFile = (file: File) => {
    if (!isSupportedMedia(file)) return false;
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be under 5MB");
      return false;
    }

    const localUrl = URL.createObjectURL(file);
    pendingMediaCache.set(localUrl, file);
    insertMediaBlock(file, localUrl);
    return true;
  };

  const ensureWritableAfterMedia = (block: HTMLElement) => {
    const next = block.nextElementSibling;
    if (next && !next.classList.contains("justnote-media-block")) return;

    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    block.after(paragraph);
  };

  const getTopLevelEditorChild = (node: Node | null) => {
    const editor = contentRef.current;
    if (!editor || !node) return null;

    let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
    while (current && current.parentNode !== editor) {
      current = current.parentNode;
    }

    return current instanceof HTMLElement ? current : null;
  };

  const moveDraggedMedia = (event: React.DragEvent<HTMLDivElement>) => {
    const editor = contentRef.current;
    const dragged = draggedMediaRef.current;
    if (!editor || !dragged || !editor.contains(dragged)) return;

    event.preventDefault();

    const target = event.target instanceof Node ? event.target : null;
    const targetBlock = getTopLevelEditorChild(target);

    if (targetBlock && targetBlock !== dragged && !dragged.contains(targetBlock)) {
      const rect = targetBlock.getBoundingClientRect();
      const shouldPlaceAfter = event.clientY > rect.top + rect.height / 2;
      editor.insertBefore(dragged, shouldPlaceAfter ? targetBlock.nextSibling : targetBlock);
    } else if (!targetBlock) {
      editor.appendChild(dragged);
    }

    const next = dragged.nextElementSibling;
    if (!next || next.classList.contains("justnote-media-block")) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      dragged.after(paragraph);
      moveCaretToStart(paragraph);
    }

    ensureWritableAfterMedia(dragged);
    syncEditorContent();
    setSelectedMediaBlock(dragged);
  };

  const moveSelectedMedia = (direction: "up" | "down") => {
    const editor = contentRef.current;
    if (!editor || !mediaSelection) return;

    const block = getMediaBlocks()[mediaSelection.index];
    if (!block) {
      setSelectedMediaBlock(null);
      return;
    }

    const sibling = direction === "up" ? block.previousElementSibling : block.nextElementSibling;
    if (!sibling) {
      setSelectedMediaBlock(block);
      return;
    }

    if (direction === "up") {
      editor.insertBefore(block, sibling);
    } else {
      sibling.after(block);
    }

    ensureWritableAfterMedia(block);
    syncEditorContent();
    setSelectedMediaBlock(block);
    block.focus({ preventScroll: true });
    block.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const setCaretFromPoint = (x: number, y: number) => {
    const editor = contentRef.current;
    if (!editor) return;

    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };

    let range = doc.caretRangeFromPoint?.(x, y) || null;
    const position = !range ? doc.caretPositionFromPoint?.(x, y) : null;
    if (!range && position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }

    if (!range || !editor.contains(range.startContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const handleMarkdownShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const block = getTopLevelEditorChild(selection.anchorNode);
    if (!block || block.classList.contains("justnote-media-block")) return;

    const raw = block.textContent || "";
    const value = raw.trim();
    const shortcut = new Map<string, () => void>([
      ["#", () => document.execCommand("formatBlock", false, "h1")],
      ["##", () => document.execCommand("formatBlock", false, "h2")],
      [">", () => document.execCommand("formatBlock", false, "blockquote")],
      ["-", () => document.execCommand("insertUnorderedList")],
      ["1.", () => document.execCommand("insertOrderedList")],
      ["---", insertDivider],
    ]).get(value);

    if (!shortcut) return;
    event.preventDefault();
    block.textContent = "";
    shortcut();
    syncEditorContent();
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mediaSelection && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      moveSelectedMedia(event.key === "ArrowUp" ? "up" : "down");
      return;
    }

    handleMarkdownShortcut(event);
  };

  const handleEditorSelection = (target: EventTarget | null) => {
    const block = target instanceof Element ? target.closest<HTMLElement>(".justnote-media-block") : null;
    setSelectedMediaBlock(block && contentRef.current?.contains(block) ? block : null);
  };

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
      attachMediaFile(file);
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
      <div className="min-h-12 shrink-0 px-3 md:px-6 py-2 flex items-center gap-3 border-b border-border/60 text-xs text-muted-foreground overflow-x-auto scrollbar-none whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", save === "saving" || saving ? "bg-amber-500" : "bg-emerald-500")} />
          {saving ? "Syncing to Shelby" : save === "saving" ? "Saving" : "Saved"}
        </span>
        {note.encrypted && (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Encrypted
          </span>
        )}
        {walletAddr && (
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Owned
          </span>
        )}
        <div className="flex-1" />
        <span className="hidden md:inline">
          {articleStats.words} words - {articleStats.readMinutes} min read
          {articleStats.images > 0 ? ` - ${articleStats.images} image${articleStats.images === 1 ? "" : "s"}` : ""}
        </span>
        {onSaveOnChain && (
          <>
            <Select value={expiryDays} onValueChange={setExpiryDays}>
              <SelectTrigger className="h-8 w-[104px] text-xs bg-background border-border/70">
                <SelectValue placeholder="Expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Day</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="365">1 Year</SelectItem>
                <SelectItem value="3650">10 Years</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={saveOnChain} disabled={saving} className="h-8 bg-gradient-brand text-white border-none shadow-soft disabled:opacity-70">
              {saving ? "Syncing" : "Publish"}
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Delete note">
              <Trash2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDelete(true)}>Delete Local Copy</DropdownMenuItem>
            {walletAddr && (
              <DropdownMenuItem onClick={() => onDelete(false)} className="text-destructive">
                Delete Everywhere (Shelby)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pb-24 md:pb-0">
        <article className="justnote-composer max-w-[760px] mx-auto px-4 sm:px-6 md:px-12 py-8 sm:py-10 md:py-14">
          <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground">
                  <FolderClosed className="h-3.5 w-3.5 mr-1.5" />
                  {note.folder}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {FOLDERS.map((f) => (
                  <DropdownMenuItem key={f} onClick={() => { onChange({ folder: f }); triggerSave(); }}>
                    {f}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Tags
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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

            <span className="hidden sm:inline">Updated {relTime(note.updatedAt)}</span>
          </div>

          <textarea
            ref={titleRef}
            rows={1}
            value={note.title}
            onChange={(e) => { onChange({ title: e.target.value }); resizeTextarea(e.target); triggerSave(); }}
            placeholder="Title"
            className="justnote-title-input w-full resize-none overflow-hidden font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.04] bg-transparent outline-none placeholder:text-muted-foreground/35"
          />
          <textarea
            ref={subtitleRef}
            rows={1}
            value={note.subtitle || ""}
            onChange={(e) => { onChange({ subtitle: e.target.value }); resizeTextarea(e.target); triggerSave(); }}
            placeholder="Subtitle"
            className="mt-5 w-full resize-none overflow-hidden bg-transparent text-lg sm:text-xl md:text-2xl leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />

          {note.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground inline-flex items-center gap-1.5">
                  <Hash className="h-2.5 w-2.5" />{t}
                  <button
                    onClick={() => toggleTag(t)}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                    aria-label={`remove ${t}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="justnote-format-bar mt-9 mb-8 flex items-center gap-1 overflow-x-auto scrollbar-thin">
            <ToolBtn label="Bold" onClick={() => exec("bold")}><Bold className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Italic" onClick={() => exec("italic")}><Italic className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Underline" onClick={() => exec("underline")}><Underline className="h-4 w-4" /></ToolBtn>
            <Sep />
            <ToolBtn label="Heading 1" onClick={() => exec("formatBlock", "h1")}><Heading1 className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Heading 2" onClick={() => exec("formatBlock", "h2")}><Heading2 className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Quote" onClick={() => exec("formatBlock", "blockquote")}><Quote className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Code block" onClick={() => exec("formatBlock", "pre")}><Code className="h-4 w-4" /></ToolBtn>
            <Sep />
            <ToolBtn label="Bulleted list" onClick={() => exec("insertUnorderedList")}><List className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Link" onClick={createLink}><Link2 className="h-4 w-4" /></ToolBtn>
            <ToolBtn label="Divider" onClick={insertDivider}><Minus className="h-4 w-4" /></ToolBtn>
            <Sep />
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*,video/*,audio/*"
              onChange={handleFileSelect}
            />
            <ToolBtn label="Add media" onClick={() => fileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></ToolBtn>
          </div>

          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Tell your story..."
            onInput={syncEditorContent}
            onClick={(e) => handleEditorSelection(e.target)}
            onFocusCapture={(e) => handleEditorSelection(e.target)}
            onKeyDown={handleEditorKeyDown}
            onPaste={(e) => {
              e.preventDefault();
              if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                Array.from(e.clipboardData.files).forEach(attachMediaFile);
                return;
              }
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            onDrop={(e) => {
              if (draggedMediaRef.current) {
                moveDraggedMedia(e);
                draggedMediaRef.current = null;
                return;
              }

              if (e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setCaretFromPoint(e.clientX, e.clientY);
                Array.from(e.dataTransfer.files).forEach(attachMediaFile);
                return;
              }

              e.preventDefault();
            }}
            onDragStart={(e) => {
              const target = e.target instanceof Element ? e.target.closest<HTMLElement>(".justnote-media-block") : null;
              const isCaption = e.target instanceof Element && !!e.target.closest("figcaption");
              if (!target) return;
              if (isCaption) {
                e.preventDefault();
                return;
              }

              draggedMediaRef.current = target;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", "justnote-media-block");
            }}
            onDragOver={(e) => {
              if (!draggedMediaRef.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnd={() => {
              draggedMediaRef.current = null;
            }}
            className={cn(
              "justnote-editor-content mt-8 min-h-[420px] outline-none text-foreground/90 whitespace-pre-wrap",
              "prose prose-sm max-w-none"
            )}
          />
        </article>
      </div>

      {mediaSelection && (
        <div className="justnote-media-actionbar" role="toolbar" aria-label="Selected media controls">
          <button
            type="button"
            onClick={() => moveSelectedMedia("up")}
            disabled={!mediaSelection.canMoveUp}
            aria-label="Move media up"
            title="Move media up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => moveSelectedMedia("down")}
            disabled={!mediaSelection.canMoveDown}
            aria-label="Move media down"
            title="Move media down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedMediaBlock(null)}
            aria-label="Close media controls"
            title="Close media controls"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="h-10 w-10 md:h-8 md:w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
  >
    {children}
  </button>
);

const Sep = () => <span className="h-4 w-px bg-border mx-1" />;
