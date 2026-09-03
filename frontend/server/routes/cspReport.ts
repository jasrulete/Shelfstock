import express, { Router } from 'express';

const router = Router();

/**
 * Where the page CSP's reports go.
 *
 * The policy in next.config.js is report-only, which enforces nothing - its
 * entire value is the report, and before this route existed there was nowhere
 * for one to land: violations reached the console of whoever triggered them
 * and stopped there. "Promote once the report is clean" had no report.
 *
 * Browsers send two shapes. Firefox and Safari follow the legacy report-uri
 * directive and POST { "csp-report": {...} } as application/csp-report.
 * Chromium follows the Reporting API and POSTs an array of {type, url, body}
 * as application/reports+json. express.json() parses only application/json by
 * default, so this route carries its own parser for those two types, with its
 * own limit - a report has no business being larger than a few kilobytes.
 *
 * The endpoint has to be unauthenticated: it is the browser calling, not a
 * signed-in user. So it is written to be safe to hit with anything at all - a
 * fixed 204 with an empty body, one log line per violation with every field
 * clipped, and nothing from the request ever echoed back.
 */
const reportParser = express.json({
  type: ['application/csp-report', 'application/reports+json'],
  limit: '50kb',
});

const FIELD_MAX = 200;

function clip(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.length > FIELD_MAX ? `${s.slice(0, FIELD_MAX)}…` : s;
}

interface Violation {
  directive: string;
  blocked: string;
  document: string;
  source: string;
  line: string;
}

function fromLegacy(body: unknown): Violation | null {
  const report = (body as { 'csp-report'?: unknown } | null)?.['csp-report'];
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  return {
    directive: clip(r['effective-directive'] ?? r['violated-directive']),
    blocked: clip(r['blocked-uri']),
    document: clip(r['document-uri']),
    source: clip(r['source-file']),
    line: clip(r['line-number']),
  };
}

function fromReportingApi(body: unknown): Violation[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry) => {
    if (entry?.type !== 'csp-violation' || !entry.body || typeof entry.body !== 'object') return [];
    const b = entry.body as Record<string, unknown>;
    return [
      {
        directive: clip(b.effectiveDirective),
        blocked: clip(b.blockedURL),
        document: clip(b.documentURL ?? entry.url),
        source: clip(b.sourceFile),
        line: clip(b.lineNumber),
      },
    ];
  });
}

router.post('/', reportParser, (req, res) => {
  const violations = Array.isArray(req.body)
    ? fromReportingApi(req.body)
    : [fromLegacy(req.body)].filter((v): v is Violation => v !== null);

  for (const v of violations) {
    // One line, fixed shape, never the raw body. This prefix is what
    // OPERATIONS.md tells the reader to filter the Vercel log on.
    const where = v.source ? ` (source ${v.source}:${v.line})` : '';
    console.warn(
      `CSP violation: ${v.directive || '?'} blocked ${v.blocked || '(inline)'} on ${v.document || '?'}${where}`
    );
  }

  res.status(204).end();
});

export default router;
