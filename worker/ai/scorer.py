def score_segments(segments):
    scored = []

    for s in segments:
        duration = s["end"] - s["start"]
        viral_score = s["hook_score"] * 10

        if duration < 60:
            viral_score += 5
        if duration < 30:
            viral_score += 5

        scored.append({
            **s,
            "viral_score": viral_score
        })

    scored.sort(key=lambda x: x["viral_score"], reverse=True)
    return scored[:5]
