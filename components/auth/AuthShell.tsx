import Link from 'next/link';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <section className="grid w-full max-w-md gap-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <Link href="/" className="text-xl font-black text-[#2155d9]">
            ApprovLine
          </Link>
          <h1 className="mt-6 text-3xl font-black text-slate-950">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
        </div>
        {children}
        <p className="text-center text-sm text-slate-600">{footer}</p>
      </section>
    </main>
  );
}
