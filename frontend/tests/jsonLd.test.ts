import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../lib/jsonLd';

// JSON-LD is injected with dangerouslySetInnerHTML, and its payload includes
// product names and descriptions that an admin types through the product CRUD
// endpoint. JSON.stringify escapes quotes but NOT "<", so without this the
// payload below closes the script tag and everything after it is live HTML.
describe('serializeJsonLd', () => {
  it('escapes < so a product name cannot close the script tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
  });

  it('escapes the line separators JSON allows but JavaScript does not', () => {
    const LINE_SEP = String.fromCharCode(0x2028);
    const PARA_SEP = String.fromCharCode(0x2029);

    const out = serializeJsonLd({ name: `a${LINE_SEP}b${PARA_SEP}c` });

    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARA_SEP);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('still round-trips to the original value', () => {
    const value = { name: '</script>', price: '19.99', nested: { ok: true } };

    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });
});
