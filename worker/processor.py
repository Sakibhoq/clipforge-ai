import json
import uuid
from pathlib import Path
from typing import Dict

from storage.s3 import S3Storage
from models.clip import Clip
from core.database import SessionLocal
from worker.video.ffmpeg import cut_clip
from worker.video.segments import generate_clip_segments


TMP_DIR = Path("/tmp")


def process_job(job, upload):
    storage = S3Storage()
    db = SessionLocal()

    source_path = TMP_DIR / f"source-{uuid.uuid4()}.mp4"

    try:
        # 1. Download source video
        storage.download(upload.storage_key, source_path)

        # 2. Parse transcript
        transcript: Dict = json.loads(upload.transcript)

        # 3. Generate clip plans
        clip_plans = generate_clip_segments(transcript)

        for plan in clip_plans:
            clip_id = uuid.uuid4().hex
            clip_path = TMP_DIR / f"clip-{clip_id}.mp4"

            # 4. Cut clip
            cut_clip(
                input_path=source_path,
                output_path=clip_path,
                start=plan["start"],
                end=plan["end"],
            )

            # 5. Upload clip
            clip_key = f"clips/{upload.id}/{clip_id}.mp4"
            storage.upload(clip_path, clip_key)

            # 6. Save DB row
            clip = Clip(
                upload_id=upload.id,
                job_id=job.id,
                storage_key=clip_key,
                start_time=plan["start"],
                end_time=plan["end"],
                duration=plan["duration"],
            )
            db.add(clip)
            db.commit()

            # 7. Cleanup clip file
            clip_path.unlink(missing_ok=True)

        job.status = "done"
        db.commit()

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        db.commit()
        raise

    finally:
        source_path.unlink(missing_ok=True)
        db.close()
