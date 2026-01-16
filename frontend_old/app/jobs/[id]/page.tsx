"use client"

import { useEffect, useState } from "react"
import { api } from "../../../lib/api"
import ClipCard from "../../../components/ClipCard"

export default function JobPage({ params }: any) {
  const [job, setJob] = useState<any>(null)

  useEffect(() => {
    api.job(params.id).then(setJob)
  }, [])

  if (!job) return null

  return (
    <div>
      <h2>Clips</h2>
      {job.clips.map((c: any, i: number) => (
        <ClipCard key={i} clip={c} />
      ))}
    </div>
  )
}
