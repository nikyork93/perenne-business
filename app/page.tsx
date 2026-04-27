import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass animate-rise-in max-w-xl w-full p-12 text-center">
        <h1 className="font-display italic text-5xl leading-none tracking-tight">
          Perenne Business
        </h1>
        <p className="mt-4 text-ink-dim text-sm max-w-md mx-auto leading-relaxed">
          Branded digital notebooks for your team.
          Design your cover, purchase codes, distribute to employees.
        </p>
        <div className="mt-10 flex gap-3 justify-center">
          <Link href="/login" className="btn">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
        </div>
        <p className="mt-12 label">
          V1 · Scaffold stage · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
