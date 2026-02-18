import time

REQUESTS = {}

def rate_limit(key: str, limit: int, window: int):
    now = time.time()
    REQUESTS.setdefault(key, [])
    REQUESTS[key] = [t for t in REQUESTS[key] if now - t < window]

    if len(REQUESTS[key]) >= limit:
        return False

    REQUESTS[key].append(now)
    return True
if not rate_limit(user.email, 5, 60):
    raise HTTPException(429, "Too many uploads")
