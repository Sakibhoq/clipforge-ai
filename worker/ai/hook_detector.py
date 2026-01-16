def detect_hooks(segments):
    hooks = []

    for s in segments:
        text = s["text"].lower()

        score = 0
        if "you" in text: score += 1
        if "this" in text: score += 1
        if "secret" in text: score += 2
        if "never" in text: score += 1
        if "why" in text: score += 1

        if score >= 2:
            hooks.append({
                **s,
                "hook_score": score
            })

    return hooks
