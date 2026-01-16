import requests

API = "http://backend:8000"

def update_job(job_id, status, clips=None):
    requests.post(f"{API}/jobs/{job_id}/update", json={
        "status": status,
        "clips": clips or []
    })
