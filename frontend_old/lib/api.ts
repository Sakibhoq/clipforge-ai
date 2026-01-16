import { getToken } from "./auth"

const API = "http://localhost:8000"

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()

  const headers: any = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  const res = await fetch(`${API}${path}`, { ...options, headers })
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }),

  register: (email: string, password: string) =>
    request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }),

  upload: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request("/upload", { method: "POST", body: form })
  },

  jobs: () => request("/jobs"),

  job: (id: number) => request(`/jobs/${id}`)
}
