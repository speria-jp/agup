import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FileSystem, FileEntry } from "./interface.ts";

export class LocalFileSystem implements FileSystem {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  async readDirectory(dirPath: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    await this.walkDirectory(dirPath, dirPath, entries);
    return entries;
  }

  private async walkDirectory(
    basePath: string,
    currentPath: string,
    entries: FileEntry[],
  ): Promise<void> {
    const items = await fs.readdir(currentPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      if (item.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, entries);
      } else if (item.isFile()) {
        const content = await fs.readFile(fullPath, "utf-8");
        const relativePath = path.relative(basePath, fullPath);
        entries.push({ path: relativePath, content });
      }
    }
  }
}
