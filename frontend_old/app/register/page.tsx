"use client"

import { useState } from "react"
import { api } from "../../lib/api"

export default function Register() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function submit() {
    await api.register(email, password)
    window.location.href = "/login"
  }

  return (
    <div className="center">
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
      <button onClick={submit}>Register</button>
    </div>
  )
}
