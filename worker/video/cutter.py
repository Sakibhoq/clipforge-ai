import os
import subprocess
from time import time

CLIPS_DIR = "/data/clips"
os.makedirs(CLIPS_DIR, exist_ok=True)

def generate_clips(job, segments):
    outputs = []

    for s in segments:
        output = f"{CLIPS_DIR}/clip_{int(time())}.mp4"

        subprocess.run([
            "ffmpeg", "-y",
            "-i", job["video_path"],
            "-ss", str(s["start"]),
            "-t", str(s["end"] - s["start"]),
            "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
            "-preset", "fast",
            output
        ])

        outputs.append({
            "path": output,
            "viral_score": s["viral_score"]
        })

    return outputs
