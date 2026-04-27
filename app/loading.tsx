export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
        <div className="text-[11px] font-mono text-ink-faint tracking-wider">LOADING</div>
      </div>
    </main>
  );
}
