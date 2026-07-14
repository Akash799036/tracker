export default function Stub({ title, note }: { title: string; note?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8">
        <p className="text-slate-600">
          {note || 'This page is stubbed as part of the Next.js port. Port the original page logic from the corresponding legacy JS file.'}
        </p>
      </div>
    </div>
  );
}
