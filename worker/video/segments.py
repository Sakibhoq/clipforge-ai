from typing import List, Dict, Optional

MIN_CLIP_DURATION = 45.0
MAX_CLIP_DURATION = 120.0


def _span_from_transcript_segments(segments: List[Dict]) -> Optional[Dict]:
    """
    Build a fallback clip from the overall transcript time span.
    If we can't meet MIN_CLIP_DURATION, return the longest possible span
    (up to MAX_CLIP_DURATION) so we at least produce ONE clip.
    """
    if not segments:
        return None

    start = float(segments[0].get("start", 0.0))
    end = float(segments[-1].get("end", start))

    # Guard against broken transcript data
    if end <= start:
        return None

    span = end - start

    # If transcript is long enough, take up to MAX from the beginning
    if span >= MIN_CLIP_DURATION:
        clip_end = min(end, start + MAX_CLIP_DURATION)
        return {
            "start": start,
            "end": clip_end,
            "duration": float(clip_end - start),
            "fallback": True,
        }

    # Transcript span shorter than MIN — still return ONE clip
    # (only happens when source itself is short / low speech)
    return {
        "start": start,
        "end": end,
        "duration": float(span),
        "fallback": True,
    }


def generate_clip_segments(transcript: Dict) -> List[Dict]:
    segments = transcript.get("segments", []) or []
    clips: List[Dict] = []

    if not segments:
        return clips

    clip_start: Optional[float] = None
    clip_end: Optional[float] = None

    for seg in segments:
        seg_start = float(seg.get("start", 0.0))
        seg_end = float(seg.get("end", seg_start))

        # skip invalid transcript entries
        if seg_end <= seg_start:
            continue

        if clip_start is None:
            clip_start = seg_start
            clip_end = seg_end
            continue

        proposed_duration = seg_end - clip_start

        if proposed_duration > MAX_CLIP_DURATION:
            # finalize previous clip
            if clip_end is not None:
                duration = clip_end - clip_start
                if duration >= MIN_CLIP_DURATION:
                    clips.append(
                        {
                            "start": clip_start,
                            "end": clip_end,
                            "duration": float(duration),
                        }
                    )

            # start a new clip at this segment
            clip_start = seg_start
            clip_end = seg_end
        else:
            clip_end = seg_end

    # flush last clip
    if clip_start is not None and clip_end is not None:
        duration = clip_end - clip_start
        if duration >= MIN_CLIP_DURATION:
            clips.append(
                {
                    "start": clip_start,
                    "end": clip_end,
                    "duration": float(duration),
                }
            )

    # Fallback: guarantee at least ONE clip
    if not clips:
        fb = _span_from_transcript_segments(segments)
        if fb:
            clips.append(fb)

    return clips
