/** Types for lib/ean13.js — see that file for why it is plain JavaScript. */

/** The check digit for exactly 12 digits. Throws on anything else. */
export function checkDigit(twelve: string): string;

/** True for a 13-digit string whose last digit is the correct check digit. */
export function isValidEan13(code: unknown): code is string;

/** The store-internal EAN-13 for a product id: `200` + id padded to 9 + check digit. */
export function ean13FromProductId(id: number): string;

/** 95 modules as a string of '1' (bar) / '0' (space), or null for an invalid code. */
export function ean13Modules(code: unknown): string | null;
