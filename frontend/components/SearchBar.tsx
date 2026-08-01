'use client';

import { Input } from './ui/Field';

// This component is intentionally "dumb" - it just reports every keystroke
// up to the parent immediately. The debouncing and request-cancellation
// logic lives in useProducts, which is the layer that actually knows about
// network requests. Keeping the input itself uncontrolled-free and instant
// avoids any visible lag while typing.
//
// The label is sr-only: the placeholder plus the surrounding page heading make
// the purpose obvious visually, but screen readers still get a real name.
export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label="Search products"
      hideLabel
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search products..."
    />
  );
}
