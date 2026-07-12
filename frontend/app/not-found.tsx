import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600"
      >
        Back to the store
      </Link>
    </div>
  );
}
