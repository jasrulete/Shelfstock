'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      // Only a transport or rate-limit failure reaches here; the endpoint
      // answers 200 whether or not the address is registered.
      setError(err instanceof ApiError ? err.message : 'Could not send the reset link');
    } finally {
      setSubmitting(false);
    }
  }

  // The confirmation is deliberately vague about whether an account exists -
  // saying "we sent it" for a known address and "no such account" otherwise
  // would turn this page into a way to test who shops here.
  if (sent) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-2xl font-bold">Check your email</h1>
        <p className="text-gray-600">
          If <span className="font-medium">{email}</span> has an account, a reset link is on its
          way. It works once and expires in an hour.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Nothing arrived? Check spam, or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-brand-600 underline"
          >
            try a different address
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">Reset your password</h1>
      <p className="mb-4 text-sm text-gray-600">
        Enter the email you signed up with and we&rsquo;ll send you a link to choose a new
        password.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-3 text-sm text-gray-500">
        Remembered it?{' '}
        <Link href="/login" className="text-brand-600 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
