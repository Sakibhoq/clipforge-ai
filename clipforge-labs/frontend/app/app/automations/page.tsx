export default function AutomationsPage() {
  return (
    <div className="surface-soft rounded-2xl p-6 text-sm text-white/75">
      <div className="text-xs text-white/50">Automation & Publish</div>
      <div className="mt-2 text-base font-semibold text-white/90">Use the shared Orbito Publish workspace</div>
      <p className="mt-2 max-w-2xl text-white/65">
        Connections and scheduling are unified under Orbito Publish. Open it below to manage channels.
      </p>
      <a href="/app/studio" className="btn-ghost mt-4 inline-flex px-4 py-2 text-xs">
        Open Publish
      </a>
    </div>
  );
}
