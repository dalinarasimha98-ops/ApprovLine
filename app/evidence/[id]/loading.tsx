export default function UnifiedEvidenceLoading() {
  return (
    <div className="min-h-screen bg-[#020a15] p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-10 rounded-xl border border-white/[0.05] bg-white/[0.025]" />
        <div className="h-36 rounded-xl border border-white/[0.05] bg-white/[0.035]" />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="h-[660px] rounded-xl border border-white/[0.05] bg-white/[0.025]" />
          <div className="grid content-start gap-3">
            <div className="h-56 rounded-xl border border-white/[0.05] bg-white/[0.025]" />
            <div className="h-44 rounded-xl border border-white/[0.05] bg-white/[0.025]" />
            <div className="h-40 rounded-xl border border-white/[0.05] bg-white/[0.025]" />
          </div>
        </div>
      </div>
    </div>
  );
}
