import requests

API = "http://backend:8000"

def fetch_job():
    r = requests.get(f"{API}/jobs/next")
    if r.status_code != 200:
        return None
    return r.json()

def complete_job(job_id, clips):
    requests.post(f"{API}/jobs/{job_id}/complete", json={"clips": clips})

def fail_job(job_id, error):
    requests.post(f"{API}/jobs/{job_id}/fail", json={"error": error})
