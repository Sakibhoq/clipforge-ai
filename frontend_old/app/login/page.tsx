"use client"

import { useState } from "react"
import { api } from "../../lib/api"
import { login } from "../../lib/auth"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function submit() {
    const res = await api.login(email, password)
    login(res.access_token)
    window.location.href = "/dashboard"
  }

  return (
    <div className="center">
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
      <button onClick={submit}>Login</button>
    </div>
  )
}
