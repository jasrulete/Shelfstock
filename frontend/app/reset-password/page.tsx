'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

// useSearchParams() opts a page out of static rendering unless it sits inside
// a Suspense boundary - the same reason /login is shaped this way.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Checked here as well as on the server: the server enforces the rule,
    // this just saves a round trip to be told something obvious.
    if (password !== confirm) {
      setError('Those two passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      // Straight to login rather than signing them in: proving they can use
      // the new password is the point of having just set it.
      router.push('/login?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password');
    } finally {
      setSubmitting(false);
    }
  }

  // A link with no token at all is a dead end - say so rather than showing a
  // form that cannot possibly work.
  if (!token) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-2xl font-bold">This link is incomplete</h1>
        <p className="text-gray-600">
          It is missing its reset token. Links expire after an hour and can only be used once.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          <Link href="/forgot-password" className="text-brand-600 underline">
            Request a new one
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirm new password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Saving...' : 'Save new password'}
        </Button>
      </form>
    </div>
  );
}
