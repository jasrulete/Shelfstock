'use client';

/**
 * Only renders when the root layout itself threw, which means the fonts, the
 * Tailwind bundle and NavBar/Footer may all be unavailable. It therefore
 * replaces <html> and <body> and uses inline styles with no imports - a
 * fallback that depends on the thing that just failed is not a fallback.
 *
 * Same rule as app/error.tsx: fixed copy plus at most error.digest, never
 * error.message and never the stack.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#faf9f7',
          color: '#1c1917',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem' }}>ShelfStock is having a moment</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#78716c' }}>
            The page couldn&apos;t load. Trying again usually works.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: 'pointer',
              border: 0,
              borderRadius: '0.25rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#ffffff',
              backgroundColor: '#2563eb',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#a8a29e' }}>
              Reference: <span style={{ fontFamily: 'monospace' }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
