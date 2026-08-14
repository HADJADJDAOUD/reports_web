/**
 * Minimal type declarations for dependencies that ship without usable types
 * through this project's module resolution.
 */

declare module "bidi-js" {
  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }

  export interface Bidi {
    getEmbeddingLevels(
      text: string,
      baseDirection?: "ltr" | "rtl" | "auto",
    ): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): [number, number][];
    getReorderedIndices(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): number[];
    getReorderedString(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): string;
    getMirroredCharacter(character: string): string | null;
    /** Takes the raw levels array, not the `getEmbeddingLevels` result object. */
    getMirroredCharactersMap(
      text: string,
      levels: Uint8Array,
      start?: number,
      end?: number,
    ): Map<number, string>;
  }

  export default function bidiFactory(): Bidi;
}

/**
 * File System Access API — used by the export to write the report and its
 * attachments folder straight to disk. Chromium-only, hence the optional
 * `showDirectoryPicker`; the export falls back to a ZIP when it is missing.
 */
interface FileSystemWritableFileStream {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    id?: string;
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

declare module "fontkit" {
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    lineGap: number;
    xHeight: number;
    capHeight: number;
    numGlyphs: number;
    familyName: string;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }

  export function create(buffer: Uint8Array, postscriptName?: string): Font;
  export function openSync(path: string, postscriptName?: string): Font;
}
