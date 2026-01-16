from typing import List, Dict

MIN_CLIP_DURATION = 30.0
MAX_CLIP_DURATION = 60.0


def generate_clip_segments(transcript: Dict) -> List[Dict]:
    segments = transcript.get("segments", [])
    clips: List[Dict] = []

    if not segments:
        return clips

    clip_start = None
    clip_end = None

    for seg in segments:
        seg_start = float(seg["start"])
        seg_end = float(seg["end"])

        if clip_start is None:
            clip_start = seg_start
            clip_end = seg_end
            continue

        proposed_duration = seg_end - clip_start

        if proposed_duration > MAX_CLIP_DURATION:
            duration = clip_end - clip_start
            if duration >= MIN_CLIP_DURATION:
                clips.append({
                    "start": clip_start,
                    "end": clip_end,
                    "duration": duration,
                })

            clip_start = seg_start
            clip_end = seg_end
        else:
            clip_end = seg_end

    if clip_start is not None and clip_end is not None:
        duration = clip_end - clip_start
        if duration >= MIN_CLIP_DURATION:
            clips.append({
                "start": clip_start,
                "end": clip_end,
                "duration": duration,
            })

    return clips
