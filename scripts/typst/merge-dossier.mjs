#!/usr/bin/env node
/**
 * scripts/typst/merge-dossier.mjs
 *
 * Merges a complete single-PDF application dossier (ADUM / PhD / CIFRE ready)
 * for one offer or all offers in `output/`, in the canonical order:
 *   1. {NNN}-cv-*.pdf
 *   2. {NNN}-cover-letter-*.pdf
 *   3. notes.pdf (academic transcripts — root or documents/)
 *   4. recommendation / recommandation PDF(s) (root or documents/, optional)
 *
 * Output naming:
 *   output/{NNN}-dossier-{candidate-slug}-{company}-{YYYY-MM-DD}.pdf
 *
 * Usage:
 *   node scripts/typst/merge-dossier.mjs --all
 *   node scripts/typst/merge-dossier.mjs --id 002
 *   node scripts/typst/merge-dossier.mjs --id 002 --notes notes.pdf --rec recommandation.pdf
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(ROOT, 'output');
const DOCS_DIR = join(ROOT, 'documents');

function parseArgs(argv) {
  const opts = {
    all: false,
    ids: [],
    notes: null,
    recs: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--id' && argv[i + 1]) opts.ids.push(String(argv[++i]).padStart(3, '0'));
    else if (a === '--notes' && argv[i + 1]) opts.notes = resolve(process.cwd(), argv[++i]);
    else if ((a === '--rec' || a === '--recommendation') && argv[i + 1]) {
      opts.recs.push(resolve(process.cwd(), argv[++i]));
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage:\n' +
          '  node scripts/typst/merge-dossier.mjs --all [--notes notes.pdf] [--rec letter.pdf ...]\n' +
          '  node scripts/typst/merge-dossier.mjs --id 002 [--notes notes.pdf] [--rec letter.pdf ...]',
      );
      process.exit(0);
    }
  }
  if (!opts.all && opts.ids.length === 0) opts.all = true;
  return opts;
}

function findNotesPdf(explicitPath) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) throw new Error(`Transcripts PDF not found: ${explicitPath}`);
    return explicitPath;
  }
  const candidates = [
    join(DOCS_DIR, 'notes.pdf'),
    join(DOCS_DIR, 'releve-notes.pdf'),
    join(ROOT, 'notes.pdf'),
    join(ROOT, 'releve-notes.pdf'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function findRecommendationPdfs(explicitPaths) {
  if (explicitPaths.length > 0) {
    for (const p of explicitPaths) {
      if (!existsSync(p)) throw new Error(`Recommendation PDF not found: ${p}`);
    }
    return explicitPaths;
  }
  const found = [];
  const recRe = /^(recomm?andation|letter[-_ ]?of[-_ ]?recommendation|reference[-_ ]?letter).*\.pdf$/i;
  for (const dir of [DOCS_DIR, ROOT]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (recRe.test(f)) found.push(join(dir, f));
    }
  }
  return found;
}

function getPageCount(pdfPath) {
  try {
    const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    const m = out.match(/Pages:\s+(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function discoverOffers() {
  if (!existsSync(OUTPUT_DIR)) return [];
  const files = readdirSync(OUTPUT_DIR);
  const byId = new Map();

  for (const f of files) {
    const cvMatch = f.match(/^(\d{3})-cv-(.+)\.pdf$/);
    if (cvMatch) {
      const [, id, suffix] = cvMatch;
      const entry = byId.get(id) || { id, suffix, cv: null, cover: null };
      entry.cv = join(OUTPUT_DIR, f);
      entry.suffix = suffix;
      byId.set(id, entry);
    }
    const coverMatch = f.match(/^(\d{3})-cover-letter-(.+)\.pdf$/);
    if (coverMatch) {
      const [, id, suffix] = coverMatch;
      const entry = byId.get(id) || { id, suffix, cv: null, cover: null };
      entry.cover = join(OUTPUT_DIR, f);
      if (!entry.suffix) entry.suffix = suffix;
      byId.set(id, entry);
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function mergeOffer(offer, notesPdf, recPdfs) {
  const inputs = [];
  const labels = [];

  if (offer.cv && existsSync(offer.cv)) {
    inputs.push(offer.cv);
    labels.push(`CV (${basename(offer.cv)})`);
  }
  if (offer.cover && existsSync(offer.cover)) {
    inputs.push(offer.cover);
    labels.push(`Cover letter (${basename(offer.cover)})`);
  }
  if (notesPdf) {
    inputs.push(notesPdf);
    labels.push(`Notes (${basename(notesPdf)})`);
  }
  for (const r of recPdfs) {
    inputs.push(r);
    labels.push(`Recommendation (${basename(r)})`);
  }

  if (inputs.length < 2) {
    console.warn(`⚠️  Offer #${offer.id}: skipped (fewer than 2 PDFs found).`);
    return null;
  }

  const outPdf = join(OUTPUT_DIR, `${offer.id}-dossier-${offer.suffix}.pdf`);
  execFileSync('pdfunite', [...inputs, outPdf], { stdio: 'pipe' });

  const pages = getPageCount(outPdf);
  const sizeKb = (statSync(outPdf).size / 1024).toFixed(1);
  console.log(`✅ #${offer.id} -> ${outPdf} (${pages ?? '?'} pages, ${sizeKb} KB)`);
  console.log(`   Included: ${labels.join(' + ')}`);
  return { id: offer.id, outPdf, pages, sizeKb, labels };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const notesPdf = findNotesPdf(opts.notes);
  const recPdfs = findRecommendationPdfs(opts.recs);

  if (!notesPdf) {
    console.warn('⚠️  No transcripts PDF found (expected documents/notes.pdf).');
  }
  if (recPdfs.length === 0) {
    console.log('ℹ️  No recommendation letter PDF found yet (drop recommandation.pdf in documents/ and re-run `make merge-dossiers`).');
  }

  const offers = discoverOffers().filter((o) => opts.all || opts.ids.includes(o.id));
  if (offers.length === 0) {
    console.error('No matching offers found in output/ (expected {NNN}-cv-*.pdf).');
    process.exit(1);
  }

  for (const offer of offers) {
    mergeOffer(offer, notesPdf, recPdfs);
  }
}

main();
