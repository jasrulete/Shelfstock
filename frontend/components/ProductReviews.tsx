'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { auth } from '@/lib/auth';
import { ReviewsResponse } from '@/types';
import Button, { buttonClasses } from './ui/Button';
import Card from './ui/Card';
import Badge from './ui/Badge';
import StarRating from './ui/StarRating';
import { Textarea } from './ui/Field';

/**
 * Accessible star picker.
 *
 * A real radio group rather than five buttons: it arrives as one stop in the
 * tab order, arrow keys move between values, and the current choice is
 * announced. The inputs are sr-only and the stars are the visible control, so
 * focus has to be mirrored onto the star with peer-focus-visible.
 */
function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-gray-700">Your rating</legend>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-7 w-7 rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 ${
                n <= value ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
              }`}
            >
              <path
                fill="currentColor"
                d="M10 1.5l2.47 5.16 5.53.74-4.03 3.9.99 5.7L10 14.3l-4.96 2.7.99-5.7L2 7.4l5.53-.74z"
              />
            </svg>
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const load = useCallback(() => {
    api
      .get<ReviewsResponse>(`/api/products/${productId}/reviews`)
      .then(setData)
      .catch(() => setData(null));
  }, [productId]);

  useEffect(() => {
    // Read auth after mount: localStorage isn't available during SSR, and
    // reading it in render would desync the server and client markup.
    setLoggedIn(auth.isLoggedIn());
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/products/${productId}/reviews`, { rating, body }, { auth: true });
      setSaved(true);
      setBody('');
      setRating(0);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save your review');
    } finally {
      setSubmitting(false);
    }
  }

  const summary = data?.summary;

  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {summary && summary.total > 0 && (
          <StarRating average={summary.average} count={summary.total} size="md" />
        )}
      </div>

      {loggedIn ? (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <RatingInput value={rating} onChange={setRating} />
            <Textarea
              label="Your review"
              rows={3}
              maxLength={2000}
              hint="Optional. Posting again replaces your previous review."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            {saved && !error && (
              <p role="status" className="text-sm font-medium text-brand-700">
                Thanks — your review is published.
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Publishing...' : 'Publish review'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-gray-600">Sign in to review this product.</p>
          <Link
            href={`/login?next=/products/${productId}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Log in
          </Link>
        </Card>
      )}

      {!data ? (
        <p className="text-sm text-gray-500">Loading reviews...</p>
      ) : data.reviews.length === 0 ? (
        <p className="text-sm text-gray-500">No reviews yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {data.reviews.map((review) => (
            <li key={review.id}>
              <Card className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating average={review.rating} />
                  <span className="text-sm font-medium">{review.reviewer}</span>
                  {review.verified_purchase && <Badge variant="success">Verified purchase</Badge>}
                  <span className="ml-auto text-xs text-gray-500">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {review.body && <p className="text-sm text-gray-700">{review.body}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
