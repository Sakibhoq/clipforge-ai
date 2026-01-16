export default function ClipCard({ clip }: any) {
  return (
    <div className="card">
      <video src={`http://localhost:8000/${clip.path}`} controls width={250} />
      <p>Viral Score: {clip.viral_score}</p>
      <a href={`http://localhost:8000/${clip.path}`} download>Download</a>
    </div>
  )
}
