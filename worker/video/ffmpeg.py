import subprocess
from pathlib import Path


def cut_clip(
    input_path: Path,
    output_path: Path,
    start: float,
    end: float,
):
    """
    Cut a video clip using ffmpeg.
    Uses stream copy when possible (fast).
    """

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(start),
        "-to", str(end),
        "-i", str(input_path),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        str(output_path),
    ]

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed: {result.stderr.decode(errors='ignore')}"
        )
