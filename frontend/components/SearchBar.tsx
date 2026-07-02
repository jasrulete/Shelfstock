'use client';

// This component is intentionally "dumb" - it just reports every keystroke
// up to the parent immediately. The debouncing and request-cancellation
// logic lives in useProducts, which is the layer that actually knows about
// network requests. Keeping the input itself uncontrolled-free and instant
// avoids any visible lag while typing.
export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search products..."
      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
    />
  );
}
