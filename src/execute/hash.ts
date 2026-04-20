import type { FileEntry } from "../fs/interface.ts";

export function computeHash(data: Record<string, unknown>): string {
  const normalized = JSON.stringify(sortKeys(data));
  const hash = new Bun.CryptoHasher("sha256").update(normalized).digest("hex");
  return `sha256:${hash}`;
}

export function computeSkillHash(
  displayTitle: string | undefined,
  files: FileEntry[],
): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const data: Record<string, unknown> = {
    display_title: displayTitle ?? null,
    files: sorted.map((f) => ({ path: f.path, content: f.content })),
  };
  return computeHash(data);
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
