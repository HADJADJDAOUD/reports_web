/**
 * IndexedDB-based attachment cache for offline access.
 * 
 * Stores attachment blobs indexed by attachment ID, allowing offline access
 * to previously viewed/downloaded attachments.
 */

const DB_NAME = "reports-attachments";
const DB_VERSION = 1;
const STORE_NAME = "attachments";

interface CachedAttachment {
  id: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  cachedAt: number;
}

class AttachmentCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
        }
      };
    });
  }

  async get(attachmentId: string): Promise<CachedAttachment | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(attachmentId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async set(attachment: CachedAttachment): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(attachment);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(attachmentId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(attachmentId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Cache an attachment from its URL for offline access.
   */
  async cacheFromUrl(
    attachmentId: string,
    url: string,
    fileName: string,
    mimeType: string = "application/pdf"
  ): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch attachment");
      
      const blob = await response.blob();
      
      await this.set({
        id: attachmentId,
        blob,
        mimeType,
        fileName,
        cachedAt: Date.now(),
      });
    } catch (error) {
      console.error("Failed to cache attachment:", error);
      throw error;
    }
  }

  /**
   * Get a blob URL for a cached attachment, or null if not cached.
   */
  async getBlobUrl(attachmentId: string): Promise<string | null> {
    const cached = await this.get(attachmentId);
    if (!cached) return null;
    
    return URL.createObjectURL(cached.blob);
  }

  /**
   * Clean up old cache entries older than 30 days.
   */
  async cleanup(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cutoff = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("cachedAt");
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff, true));

      request.onerror = () => reject(request.error);
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}

// Singleton instance
export const attachmentCache = new AttachmentCache();
