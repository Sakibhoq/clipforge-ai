from fastapi import FastAPI, UploadFile, File
from uuid import uuid4
from pathlib import Path
import shutil, os

STORAGE = Path(os.getenv("STORAGE_PATH", "/data"))
STORAGE.mkdir(parents=True, exist_ok=True)

app = FastAPI()

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/upload")
async def upload(video: UploadFile = File(...)):
    job_id = str(uuid4())
    dest = STORAGE / f"{job_id}_{video.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(video.file, f)
    (STORAGE / f"{job_id}.queued").write_text(dest.name)
    return {"job_id": job_id, "file": dest.name}
