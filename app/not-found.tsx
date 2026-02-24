import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-24 space-y-4">
      <div className="text-6xl">🗑️</div>
      <h1 className="text-2xl font-bold text-white">Paste Not Found</h1>
      <p className="text-gray-400 text-sm max-w-sm mx-auto">
        This paste doesn&apos;t exist or has expired. Check the URL and try again.
      </p>
      <Link
        href="/"
        className="inline-block mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        Create a new paste →
      </Link>
    </div>
  );
}
