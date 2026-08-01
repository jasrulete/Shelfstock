'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { controlClasses } from './ui/Field';

// Address suggestions from Photon (photon.komoot.io), komoot's free
// OpenStreetMap geocoder. Chosen over OSM's own Nominatim because the
// public Nominatim server forbids autocomplete use; Photon is built for
// search-as-you-type, needs no API key, and allows browser CORS requests.
// Fair-use API: requests are debounced and only fired from 3 chars up.

interface Suggestion {
  label: string;
  address: string;
  city: string;
}

interface PhotonFeature {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

function toSuggestion(f: PhotonFeature): Suggestion {
  const p = f.properties;
  const streetLine = p.street
    ? [p.housenumber, p.street].filter(Boolean).join(' ')
    : (p.name ?? '');
  const city = p.city ?? p.town ?? p.village ?? p.county ?? '';
  const label = Array.from(new Set([streetLine, p.district, city, p.state, p.country]))
    .filter(Boolean)
    .join(', ');
  // The address field gets everything up to (but not including) the city,
  // since city has its own form field.
  const address = [streetLine, p.district].filter(Boolean).join(', ');
  return { label, address: address || label, city };
}

export default function AddressAutocomplete({
  label,
  value,
  onChange,
  onSelect,
  hint,
  placeholder,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (s: { address: string; city: string }) => void;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const hintId = `${inputId}-hint`;
  // Set when the user picks a suggestion, so the value change it causes
  // doesn't immediately trigger another lookup and reopen the list.
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=5&lang=en`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { features: PhotonFeature[] };
        const seen = new Set<string>();
        const items = data.features
          .map(toSuggestion)
          .filter((s) => s.label && !seen.has(s.label) && seen.add(s.label));
        setSuggestions(items);
        setOpen(items.length > 0);
        setHighlighted(-1);
      } catch {
        // Network errors and aborted requests just mean no suggestions -
        // the field still works as a plain text input.
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function select(s: Suggestion) {
    skipNextLookup.current = true;
    onSelect({ address: s.address, city: s.city });
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      // While the list is open, Enter picks a suggestion instead of
      // submitting the surrounding checkout form.
      e.preventDefault();
      select(suggestions[highlighted >= 0 ? highlighted : 0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-700" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div className="relative">
        <input
          id={inputId}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
          // Browser autofill is suppressed because this field runs its own
          // suggestion list; street-address autofill would fight it.
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlighted >= 0 ? `${inputId}-option-${highlighted}` : undefined
          }
          aria-describedby={hint ? hintId : undefined}
          className={controlClasses(false)}
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-gray-200 bg-white text-sm shadow-card-hover"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                id={`${inputId}-option-${i}`}
                role="option"
                aria-selected={i === highlighted}
                // onMouseDown fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                className={`cursor-pointer px-3 py-2 ${
                  i === highlighted ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50'
                }`}
              >
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {open && (
        <p className="text-xs text-gray-500">Suggestions © OpenStreetMap contributors</p>
      )}
    </div>
  );
}
