export interface FileEntry {
  path: string;
  content: string;
}

export interface FileSystem {
  readFile(path: string): Promise<string>;
  readDirectory(path: string): Promise<FileEntry[]>;
}
