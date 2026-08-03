/**
 * Serializes a JSON-LD payload for injection into a
 * <script type="application/ld+json"> tag.
 *
 * `JSON.stringify` escapes quotes and backslashes, but not "<". The payload
 * carries product names and descriptions that an admin types through the
 * product CRUD endpoint, so a name of `</script><script>...` would close the
 * tag and turn the rest into live HTML - stored XSS, reachable by anyone who
 * views the product page. Escaping the angle bracket makes that impossible
 * while leaving the JSON valid and identical once parsed.
 *
 * U+2028 and U+2029 are legal inside a JSON string but are line terminators in
 * JavaScript source, which breaks any consumer that evaluates rather than
 * parses the block. They are escaped for the same reason.
 *
 * Written with backslash-u escapes rather than the literal characters so this
 * source stays pure ASCII - the characters themselves are invisible in most
 * editors and are exactly the kind of thing a copy/paste silently destroys.
 */
const LINE_SEP = '\u2028';

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, (char) => (char === LINE_SEP ? '\\u2028' : '\\u2029'));
}
