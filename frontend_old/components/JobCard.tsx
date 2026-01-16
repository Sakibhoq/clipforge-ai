import Link from "next/link"

export default function JobCard({ job }: any) {
  return (
    <div className="card">
      <p>Status: {job.status}</p>
      <Link href={`/jobs/${job.id}`}>View Clips</Link>
    </div>
  )
}
