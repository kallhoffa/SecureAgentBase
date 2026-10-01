#!/usr/bin/env node
/**
 * Fails when the docs link to files that do not exist.
 *
 * The doc set is only useful while its references resolve, and nothing else in
 * this repo guards that — links rot silently as files move. This walks the
 * Markdown files we treat as authoritative and checks two kinds of reference:
 *
 *   1. Markdown links   [text](./foo.md)   — resolved relative to the doc,
 *                                            then from the repo root.
 *   2. Repo path refs   `docs/cli.md`     — only for refs that start with a
 *                                            known repo-root prefix, and only
 *                                            when they resolve either way.
 *
 * Deliberately NOT checked, because they are not repo paths:
 *   - slash commands (`/tdd`, `/setup-project`)
 *   - home paths (`~/.config/opencode/skills/`)
 *   - globs and placeholders (`.scratch/`, `0001-slug.md`, `<tmpdir>/x.html`)
 *   - npm packages (`@testing-library/react`)
 *   - GCP role names (`roles/compute.admin`)
 *   - fenced code blocks (sample commands, not references)
 *
 * Exits 1 with one line per broken reference.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const REL = (abs) => abs.slice(ROOT.length + 1).split('\\').join('/');

const DOC_DIRS = ['docs', '.opencode/skills'];
const TOP_LEVEL_DOCS = [
  'README.md',
  'AGENTS.md',
  'CONTEXT.md',
  'LIFECYCLE.md',
  'WIZARD_DEV_NOTES.md',
];

// Only refs starting with one of these are treated as repo paths when they
// appear in backticks. Everything else in backticks is prose, a command, a
// flag, a package name, or a GCP identifier.
const REPO_PREFIXES = [
  'docs/',
  '.opencode/',
  'scripts/',
  'src/',
  'cli/',
  'tests/',
  'shared/',
  '.github/',
  '.semgrep/',
  'agent/',
  'agentbase/',
];

const SKIP_REF = [
  /^https?:\/\//,
  /^mailto:/,
  /^#/,
  /^~/, // home paths
  /[*?<>{}]/, // globs, placeholders, brace expansion
  /^\//, // slash commands and absolute-ish paths
  /\s/, // prose, not a path
];

const isRepoRef = (ref) => REPO_PREFIXES.some((p) => ref.startsWith(p));

function listDocs() {
  const files = new Set();
  for (const file of TOP_LEVEL_DOCS) {
    try {
      if (statSync(join(ROOT, file)).isFile()) files.add(file);
    } catch {
      /* absent is fine */
    }
  }
  for (const dir of DOC_DIRS) walk(join(ROOT, dir), files);
  return [...files].sort();
}

function walk(absDir, out, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) walk(abs, out, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.add(REL(abs));
  }
}

/**
 * A ref resolves if the path exists as a file or a directory. A bare directory
 * mention ("the rules live in src/guardrails/") is legitimate prose, so we do
 * not require an index inside it — only missing paths are a failure.
 */
function resolves(docDir, ref) {
  for (const base of [docDir, ROOT]) {
    const target = resolve(base, ref);
    try {
      if (statSync(target)) return true;
    } catch {
      /* try the next base */
    }
  }
  return false;
}

const stripAnchor = (ref) => {
  const hash = ref.indexOf('#');
  return hash === -1 ? ref : ref.slice(0, hash);
};

function collectRefs(doc, text) {
  const refs = [];
  const seen = new Set();
  const add = (raw, index) => {
    const ref = stripAnchor(raw.trim());
    if (!ref || SKIP_REF.some((re) => re.test(ref))) return;
    if (seen.has(ref)) return;
    seen.add(ref);
    refs.push({ ref, line: text.slice(0, index).split('\n').length });
  };

  // Markdown links and images.
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) add(m[1], m.index);

  // Backticked refs, but only those that look like repo paths.
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    if (isRepoRef(m[1])) add(m[1], m.index);
  }

  return refs;
}

// Paths that are legitimately absent until a tool creates them. Each is
// generated at runtime by the skill that documents it, so requiring it in the
// repo would be wrong.
const OPTIONAL_REFS = new Set([
  'docs/agents/triage-labels.md', // written by the setup-project skill
  'CONTEXT-MAP.md', // written by the domain-modeling skill
  '.scratch/', // agent scratch dir, gitignored
]);

function main() {
  const docs = listDocs();
  const broken = [];

  for (const doc of docs) {
    const raw = readFileSync(join(ROOT, doc), 'utf8');
    // Blank out fenced code blocks while preserving line numbers.
    const text = raw.replace(/```[\s\S]*?```/g, (block) => '\n'.repeat(block.split('\n').length - 1));
    const docDir = dirname(join(ROOT, doc));
    for (const { ref, line } of collectRefs(doc, text)) {
      if (OPTIONAL_REFS.has(ref)) continue;
      if (!resolves(docDir, ref)) broken.push({ doc, ref, line });
    }
  }

  console.log(`Checked ${docs.length} doc file(s).`);
  if (broken.length === 0) {
    console.log('All documentation references resolve.');
    return;
  }
  console.error(`\nBroken documentation references (${broken.length}):`);
  for (const { doc, ref, line } of broken) console.error(`  ${doc}:${line} -> ${ref}`);
  console.error('\nFix the path, or drop the reference if the file was deleted.');
  process.exit(1);
}

main();