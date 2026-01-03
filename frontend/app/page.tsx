"use client";
import { useState } from "react";
import axios from "axios";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append("video", file);
    setStatus("Uploading...");
    const res = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/upload`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    setStatus(`Queued job: ${res.data.job_id}`);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>ClipForge — MVP</h1>
      <input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={upload} disabled={!file}>Upload</button>
      <p>{status}</p>
    </main>
  );
}
