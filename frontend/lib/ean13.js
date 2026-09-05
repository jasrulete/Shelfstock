/**
 * EAN-13, the barcode on nearly every retail product.
 *
 * Plain CommonJS on purpose: this one module is used by the server (the
 * assign-barcode route), the browser (the printable sheet), and
 * scripts/seed-demo-users.js, which is plain Node and cannot import
 * TypeScript. Types live beside it in ean13.d.ts. Keeping the checksum in one
 * place is the point - a second copy that drifts prints codes no scanner will
 * accept.
 *
 * The store's own codes use GS1 prefix 200, which GS1 reserves for
 * "restricted circulation" - internal use within a store or region. So they
 * are structurally valid EAN-13s that any scanner reads, and they can never
 * collide with a real product's code. The body is the product id, zero-padded,
 * so the mapping is deterministic and needs no table.
 */

/** The check digit for 12 digits: weights 1,3,1,3,... from the left. */
function checkDigit(twelve) {
  if (!/^\d{12}$/.test(twelve)) throw new Error('checkDigit needs exactly 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** True for a 13-digit string whose last digit is the correct check digit. */
function isValidEan13(code) {
  return typeof code === 'string' && /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === code[12];
}

/** The store-internal EAN-13 for a product id: 200 + id padded to 9 + check. */
function ean13FromProductId(id) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 999_999_999) {
    throw new Error('ean13FromProductId needs a positive integer id below 10^9');
  }
  const twelve = `200${String(id).padStart(9, '0')}`;
  return twelve + checkDigit(twelve);
}

// Encoding tables. Each digit has an L (odd parity), G (even parity) and R
// pattern of 7 modules; the first digit of the code is not drawn but chooses
// which of L/G each of the next six digits uses, and the right six always
// use R. Guards: 101 at both ends, 01010 in the middle. 95 modules total.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/**
 * The 95 modules of a valid EAN-13 as a string of '1' (bar) and '0' (space),
 * or null for anything that is not a valid code. What the printable sheet
 * draws; a scanner reading the printout decodes it back to the same 13 digits.
 */
function ean13Modules(code) {
  if (!isValidEan13(code)) return null;
  const parity = PARITY[Number(code[0])];
  let out = '101';
  for (let i = 1; i <= 6; i++) {
    const digit = Number(code[i]);
    out += parity[i - 1] === 'L' ? L[digit] : G[digit];
  }
  out += '01010';
  for (let i = 7; i <= 12; i++) {
    out += R[Number(code[i])];
  }
  return out + '101';
}

module.exports = { checkDigit, isValidEan13, ean13FromProductId, ean13Modules };
