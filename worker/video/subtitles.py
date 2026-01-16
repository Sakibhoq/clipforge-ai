import subprocess
import os

def burn_captions(clips, transcript):
    final = []

    for clip in clips:
        srt = clip["path"].replace(".mp4", ".srt")
        out = clip["path"].replace(".mp4", "_captioned.mp4")

        with open(srt, "w") as f:
            for i, t in enumerate(transcript):
                f.write(f"{i+1}\n")
                f.write("00:00:00,000 --> 00:00:05,000\n")
                f.write(t["text"] + "\n\n")

        subprocess.run([
            "ffmpeg", "-y",
            "-i", clip["path"],
            "-vf", f"subtitles={srt}",
            out
        ])

        final.append({
            "path": out,
            "viral_score": clip["viral_score"]
        })

    return final
