import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Barcode from '@/components/admin/Barcode';
import { ean13Modules } from '@/lib/ean13';

describe('Barcode', () => {
  it('draws one bar per "1" module and prints the digits beneath', () => {
    const code = '4006381333931';
    const { container } = render(<Barcode code={code} />);

    const svg = screen.getByRole('img', { name: `Barcode ${code}` });
    expect(svg).toBeInTheDocument();

    // Every '1' in the module string is a black bar; nothing else is drawn in black.
    const bars = container.querySelectorAll('rect[fill="#000"]');
    const ones = Array.from(ean13Modules(code)!).filter((b) => b === '1').length;
    expect(bars).toHaveLength(ones);
    expect(svg).toHaveTextContent(code);
  });

  it('leaves quiet zones: the first bar does not start at the left edge', () => {
    const { container } = render(<Barcode code="4006381333931" moduleWidth={2} />);
    const first = container.querySelector('rect[fill="#000"]') as SVGRectElement;
    expect(Number(first.getAttribute('x'))).toBeGreaterThan(0);
  });

  it('renders nothing for an invalid code rather than a pattern no scanner accepts', () => {
    const { container } = render(<Barcode code="4006381333932" />);
    expect(container).toBeEmptyDOMElement();
  });
});
