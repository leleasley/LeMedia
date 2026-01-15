import Link from "next/link";

export const metadata = {
  title: "Offline - LeMedia",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-8xl">📡</div>
        <h1 className="mb-4 text-3xl font-semibold text-white">You&apos;re Offline</h1>
        <p className="mb-8 text-gray-300">
          It looks like you&apos;ve lost your internet connection. Check your network
          settings and try again.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-600"
          >
            Try Again
          </button>
          <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h2 className="mb-3 text-lg font-medium text-white">
              Available Offline
            </h2>
            <div className="flex flex-col gap-2">
              <Link
                href="/"
                className="rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                Home
              </Link>
              <Link
                href="/movies"
                className="rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                Movies
              </Link>
              <Link
                href="/tv"
                className="rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                TV Shows
              </Link>
              <Link
                href="/requests"
                className="rounded-md bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                My Requests
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
