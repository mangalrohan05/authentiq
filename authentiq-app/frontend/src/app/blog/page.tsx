export default function BlogHome() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
      <h1 className="text-4xl font-extrabold text-orange-600 mb-4 tracking-tight uppercase">Blog & Resources</h1>
      <p className="max-w-xl text-zinc-500 text-lg leading-relaxed">
        Stay updated with the latest in product authentication, supply chain security, and consumer protection.
      </p>
      <div className="mt-10 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 border border-zinc-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xl font-semibold mb-2">The Future of QR</h3>
          <p className="text-zinc-600 text-sm">How encrypted QR codes are replacing traditional labels.</p>
        </div>
        {/* Placeholder cards */}
      </div>
    </div>
  );
}
