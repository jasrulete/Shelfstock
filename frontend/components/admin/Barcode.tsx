import { ean13Modules } from '@/lib/ean13';

interface Props {
  code: string;
  /** Width of one module in SVG units; the drawing is 95 modules wide plus quiet zones. */
  moduleWidth?: number;
  height?: number;
  className?: string;
}

const QUIET = 9; // modules of white either side, so a scanner can find the edges

/**
 * An EAN-13 as inline SVG, for the printable sheet. Bars are 1-module rects
 * on a white ground with the quiet zones a scanner needs, and the digits are
 * printed beneath as text so a human can read what the scanner will.
 *
 * Renders nothing for an invalid code rather than a plausible-looking pattern
 * no scanner would accept.
 */
export default function Barcode({ code, moduleWidth = 2, height = 60, className }: Props) {
  const modules = ean13Modules(code);
  if (!modules) return null;

  const width = (modules.length + QUIET * 2) * moduleWidth;
  const textHeight = 14;

  return (
    <svg
      role="img"
      aria-label={`Barcode ${code}`}
      viewBox={`0 0 ${width} ${height + textHeight}`}
      width={width}
      height={height + textHeight}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={width} height={height + textHeight} fill="#fff" />
      {Array.from(modules).map((bit, i) =>
        bit === '1' ? (
          <rect key={i} x={(QUIET + i) * moduleWidth} y={0} width={moduleWidth} height={height} fill="#000" />
        ) : null
      )}
      <text
        x={width / 2}
        y={height + textHeight - 3}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={textHeight - 3}
        fill="#000"
      >
        {code}
      </text>
    </svg>
  );
}
