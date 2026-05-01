export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  updatedAt: number;
  encrypted: boolean;
};

export const FOLDERS = ["Personal", "Work", "Ideas", "Research"] as const;
export const ALL_TAGS = ["web3", "draft", "important", "todo", "reading", "design"];

const now = Date.now();
const day = 86_400_000;



export function uid() {
  return "n_" + Math.random().toString(36).slice(2, 10);
}

export function previewOf(content: string, max = 90) {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

export function relTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
