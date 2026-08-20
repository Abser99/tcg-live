"use client";

/* Records the seller's outgoing stream in the browser and posts the file to our API.

   Why here and not LiveKit egress: egress renders inside LiveKit's cloud, so it can only
   write to a cloud bucket — it can't reach this machine's disk. Capturing locally is what
   lets a setup with no bucket (and no Docker) still keep the video. Egress remains the
   right answer at scale; this covers local and small deployments. */

import { auctionsApi } from "@/lib/api";

/** The first container the browser actually supports, best first. */
function pickMimeType(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find(t => MediaRecorder.isTypeSupported(t));
}

export function createLiveRecorder() {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mime = "video/webm";
  let startedAt: Date | null = null;

  return {
    get recording() {
      return recorder?.state === "recording";
    },

    /** Begin capturing. Safe to call when unsupported — it just won't record. */
    start(stream: MediaStream): boolean {
      if (recorder || !stream.getTracks().length) return false;
      const type = pickMimeType();
      if (!type) return false;
      try {
        mime = type;
        chunks = [];
        recorder = new MediaRecorder(stream, { mimeType: type });
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        // Emit a chunk a second so a crashed tab still leaves most of the session behind.
        recorder.start(1000);
        startedAt = new Date(); // clock zero for the replay markers
        return true;
      } catch {
        recorder = null;
        return false;
      }
    },

    /** Stop and upload. Returns the stored URL, or null if there was nothing to send. */
    async stopAndUpload(auctionId: string): Promise<string | null> {
      if (!recorder) return null;
      const rec = recorder;
      recorder = null;

      const blob: Blob = await new Promise(resolve => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
        try { rec.stop(); } catch { resolve(new Blob(chunks, { type: mime })); }
      });
      chunks = [];
      if (!blob.size) return null;

      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("file", blob, `live-${auctionId}.${ext}`);
      // Anchor the markers to the recording, not to when the live was created.
      if (startedAt) form.append("startedAt", startedAt.toISOString());
      const { data } = await auctionsApi.uploadRecording(auctionId, form);
      return data.recordingUrl ?? null;
    },
  };
}
