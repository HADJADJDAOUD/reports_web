"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Download, X, RefreshCw, AlertCircle } from "lucide-react";
import { attachmentCache } from "@/lib/attachments/cache";
import { useLocale } from "@/lib/i18n/client";

interface AttachmentData {
  id: string;
  fileName: string;
  size: number;
  pageCount: number;
  convertedFromImage: boolean;
  originalFileName?: string;
}

export default function AttachmentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLocale();
  const attachmentId = params.attachmentId as string;
  /*
   * A reference inside an exported report carries a signed token, because the
   * reader is usually not the author and has no session here.
   */
  const shareToken = useSearchParams().get("t");
  const auth = shareToken ? `?t=${encodeURIComponent(shareToken)}` : "";

  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [usingCache, setUsingCache] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    async function loadAttachment() {
      try {
        setLoading(true);
        setError(null);

        // Try to get from cache first (for offline support)
        const cachedBlobUrl = await attachmentCache.getBlobUrl(attachmentId);
        
        if (cachedBlobUrl) {
          setPdfUrl(cachedBlobUrl);
          setUsingCache(true);
          // Fetch metadata in background if online
          if (navigator.onLine) {
            fetchAttachmentMetadata().catch(() => {});
          }
        } else {
          // Not cached, fetch from server
          await fetchFromServer();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load attachment");
      } finally {
        setLoading(false);
      }
    }

    loadAttachment();
  }, [attachmentId]);

  async function fetchAttachmentMetadata(): Promise<void> {
    try {
      const response = await fetch(`/api/attachments/${attachmentId}${auth}`);
      if (!response.ok) throw new Error("Attachment not found");
      
      const data = await response.json();
      setAttachment(data);
    } catch (err) {
      console.error("Failed to fetch attachment metadata:", err);
    }
  }

  async function fetchFromServer(): Promise<void> {
    if (!navigator.onLine) {
      throw new Error("No internet connection and attachment not cached");
    }

    // Fetch metadata
    await fetchAttachmentMetadata();

    // Fetch PDF and cache it
    const fileUrl = `/api/attachments/${attachmentId}/file${auth}`;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Failed to fetch attachment file");

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    setPdfUrl(blobUrl);
    setUsingCache(false);

    // Cache for offline use
    try {
      await attachmentCache.cacheFromUrl(attachmentId, fileUrl, attachment?.fileName || "attachment.pdf");
    } catch (cacheError) {
      console.error("Failed to cache attachment:", cacheError);
      // Don't fail the view if caching fails
    }
  }

  function handleDownload() {
    if (pdfUrl) {
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = attachment?.fileName || "attachment.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function handleRetry() {
    setPdfUrl(null);
    setUsingCache(false);
    setError(null);
    setLoading(true);
    fetchFromServer().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }

  function handleClose() {
    router.back();
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="size-8 animate-spin text-ink-faint" />
          <p className="text-sm text-ink-faint">Loading attachment...</p>
        </div>
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface p-4">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <AlertCircle className="size-12 text-danger" />
          <div>
            <h2 className="text-lg font-medium text-ink">Failed to load attachment</h2>
            <p className="mt-2 text-sm text-ink-faint">{error || "Unknown error"}</p>
          </div>
          {!isOnline && (
            <p className="text-xs text-ink-faint">
              You are offline. Please connect to the internet and try again.
            </p>
          )}
          <div className="flex gap-3">
            {isOnline && (
              <button
                onClick={handleRetry}
                className="rounded bg-surface-high px-4 py-2 text-sm font-medium text-ink hover:bg-surface-higher"
              >
                Retry
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-high"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/40 p-3 sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-paper">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-ui truncate text-sm font-medium" dir="auto">
              {attachment?.fileName || "Attachment"}
            </p>
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              {attachment && (
                <>
                  <span>{formatBytes(attachment.size)}</span>
                  <span>·</span>
                  <span>{t.attach.pages(attachment.pageCount)}</span>
                  {attachment.convertedFromImage && attachment.originalFileName && (
                    <>
                      <span>·</span>
                      <span>{attachment.originalFileName}</span>
                    </>
                  )}
                </>
              )}
              {usingCache && (
                <>
                  <span>·</span>
                  <span className="text-evidence">{t.viewer.offlineCopy}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleDownload}
            className="font-ui inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[0.8125rem] text-ink-soft hover:bg-surface-high hover:text-ink"
            title="Download attachment"
          >
            <Download className="size-4" aria-hidden />
            Download
          </button>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded text-ink-faint hover:bg-surface-high hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="min-h-0 flex-1 bg-surface">
          <iframe
            src={pdfUrl}
            title={attachment?.fileName || "Attachment"}
            className="h-full w-full border-0"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}
