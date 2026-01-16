import whisper

model = whisper.load_model("base")

def transcribe(video_path):
    result = model.transcribe(video_path)

    segments = []
    for s in result["segments"]:
        segments.append({
            "start": s["start"],
            "end": s["end"],
            "text": s["text"].strip()
        })

    return segments
