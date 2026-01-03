from pathlib import Path
import time

DATA = Path("/data")

def process(job_file: Path):
    video_name = job_file.read_text().strip()
    out = DATA / f"{video_name}.processed.txt"
    out.write_text("processing placeholder")
    job_file.unlink()

def loop():
    DATA.mkdir(exist_ok=True)
    while True:
        for f in DATA.glob("*.queued"):
            process(f)
        time.sleep(2)

if __name__ == "__main__":
    loop()
