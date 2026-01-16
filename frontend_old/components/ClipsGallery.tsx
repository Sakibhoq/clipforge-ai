"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Clip = {
  id: number;
  url: string;
  start_time: number;
  end_time: number;
  duration: number;
};

type Status = "loading" | "ready" | "empty" | "error";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-white/10 p-4 bg-black/40">
      <div className="aspect-video rounded-lg bg-white/5" />
      <div className="mt-3 h-4 w-2/3 rounded bg-white/5" />
      <div className="mt-2 h-3 w-1/3 rounded bg-white/5" />
    </div>
  );
}

export default function ClipsGallery({ uploadId }: { uploadId: number }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  useEffect(() => {
    setStatus("loading");

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/clips?upload_id=${uploadId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load clips");
        return res.json();
      })
      .then((data: Clip[]) => {
        if (!data.length) {
          setStatus("empty");
        } else {
          setClips(data);
          setStatus("ready");
        }
      })
      .catch(() => setStatus("error"));
  }, [uploadId]);

  function playClip(id: number) {
    Object.values(videoRefs.current).forEach((v) => v?.pause());
    const video = videoRefs.current[id];
    video?.play();
    setSelectedClipId(id);
  }

  function pauseClip(id: number) {
    videoRefs.current[id]?.pause();
    if (selectedClipId === id) setSelectedClipId(null);
  }

  function copyLink(id: number, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  /* ---------- STATES ---------- */

  if (status === "loading") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[...Array(6)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center text-gray-400">
        No clips generated yet.
        <br />
        Upload a video with speech to see results.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">
        Failed to load clips. Please refresh.
      </div>
    );
  }

  /* ---------- GRID ---------- */

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <AnimatePresence>
        {clips.map((clip, index) => {
          const isActive = selectedClipId === clip.id;

          return (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className={`relative rounded-xl border p-4 bg-black/40 shadow-sm transition ${
                isActive ? "border-blue-500/40" : "border-white/10"
              }`}
            >
              {/* VIDEO */}
              <div
                className="relative group cursor-pointer"
                onMouseEnter={() => playClip(clip.id)}
                onMouseLeave={() => pauseClip(clip.id)}
              >
                <video
                  ref={(el: HTMLVideoElement | null) => {
                    videoRefs.current[clip.id] = el;
                  }}
                  src={clip.url}
                  muted
                  loop
                  playsInline
                  controls={isActive}
                  className="w-full rounded-lg"
                />

                <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/10 group-hover:ring-white/20" />

                <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-white/60">
                  <span>{clip.start_time.toFixed(1)}s</span>
                  <span>{clip.end_time.toFixed(1)}s</span>
                </div>
              </div>

              {/* META */}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>Duration: {clip.duration.toFixed(1)}s</span>
                {isActive && <span className="text-blue-400">Playing</span>}
              </div>

              {/* ACTIONS */}
              <div className="mt-4 flex gap-2">
                <a
                  href={clip.url}
                  download
                  className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/10"
                >
                  Download
                </a>

                <button
                  onClick={() => copyLink(clip.id, clip.url)}
                  className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/10"
                >
                  {copiedId === clip.id ? "Copied!" : "Copy link"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
