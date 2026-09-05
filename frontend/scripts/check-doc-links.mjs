#!/usr/bin/env node
/**
 * Checks every relative link and heading anchor across the documentation.
 *
 *   node scripts/check-doc-links.mjs            docs/, README.md, HANDOVER.md
 *   node scripts/check-doc-links.mjs <paths...> just those files/directories
 *
 * Zero dependencies, so it runs in CI before npm install would have to.
 *
 * Why it exists: DEVELOPMENT.md §6 says prose is the weakest form of
 * enforcement. A link is the one part of prose a machine can check, and the
 * docs cross-reference each other by anchor everywhere - an INV-* heading
 * renamed in ARCHITECTURE.md silently breaks a dozen links in SECURITY.md,
 * API.md and the ADRs. This turns that into a red CI step.
 *
 * Anchors follow GitHub's slug rules: lower-case, punctuation dropped,
 * spaces to hyphens. Lines are split on \r?\n because git checks these files
 * out with CRLF on Windows and a trailing \r defeats `(.*)$`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const targets = args.length
  ? args.map((p) => resolve(p))
  : [join(repoRoot, 'docs'), join(repoRoot, 'README.md'), join(repoRoot, 'HANDOVER.md')];

function markdownFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    markdownFiles(join(path, entry.name))
  );
}

function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Lines of a file with fenced code blocks blanked, so a `#` or a link inside one is ignored. */
function proseLines(file) {
  let inFence = false;
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    });
}

const files = targets.flatMap(markdownFiles);

const anchors = new Map();
for (const file of files) {
  const set = new Set();
  for (const line of proseLines(file)) {
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match) set.add(slug(match[1]));
  }
  anchors.set(resolve(file), set);
}

let problems = 0;
function report(file, lineNo, message) {
  problems++;
  console.log(`${relative(repoRoot, file)}:${lineNo}  ${message}`);
}

for (const file of files) {
  proseLines(file).forEach((line, index) => {
    for (const match of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^(https?:|mailto:)/i.test(link)) continue;

      const [target, anchor] = link.split('#');
      const targetFile = target ? resolve(dirname(file), target) : resolve(file);
      if (!existsSync(targetFile)) {
        report(file, index + 1, `missing file: ${link}`);
        continue;
      }
      if (!anchor) continue;

      // A link into a file this run did not parse (a .ts path, say) has no
      // anchor table to check against; only markdown anchors are verified.
      const known = anchors.get(resolve(targetFile));
      if (known && !known.has(anchor)) report(file, index + 1, `missing anchor: ${link}`);
    }
  });
}

console.log(
  problems === 0
    ? `docs: ${files.length} files, every relative link and anchor resolves`
    : `docs: ${problems} broken link(s)`
);
process.exit(problems === 0 ? 0 : 1);
