#!/usr/bin/env node
/**
 * scripts/typst/build-typst-cv.mjs
 *
 * Typst CV builder with career-ops quality gates:
 * 1. Fact gate: runs `verify-cv-facts.mjs` against `cv.md` on `<bundle>/cv-tailored.md`
 * 2. Compiles `main.typ` via `typst compile --font-path font`
 * 3. Page-budget guard (default 1 page; overflow writes `.overflow.pdf`)
 * 4. Extracts real PDF text via `pdftotext` & runs `keyword-match.mjs` if `--jd` or `--report-file` is given
 * 5. Registers PDF in `data/pdf-index.tsv` (deduplicated upsert) if `--report <NNN>` is given
 *
 * Usage:
 *   node scripts/typst/build-typst-cv.mjs --bundle <bundle-dir> --out <output.pdf>
 *        [--jd <jds/slug.md>] [--report <NNN>] [--report-file <reports/NNN-....md>]
 *        [--max-pages 1] [--strict-pages] [--skip-fact-check] [--json]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const opts = {
    bundle: null,
    out: null,
    jd: null,
    report: null,
    reportFile: null,
    maxPages: 1,
    strictPages: true,
    skipFactCheck: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bundle' && argv[i + 1]) opts.bundle = argv[++i];
    else if (a === '--out' && argv[i + 1]) opts.out = argv[++i];
    else if (a === '--jd' && argv[i + 1]) opts.jd = argv[++i];
    else if (a === '--report' && argv[i + 1]) opts.report = argv[++i];
    else if (a === '--report-file' && argv[i + 1]) opts.reportFile = argv[++i];
    else if (a === '--max-pages' && argv[i + 1]) opts.maxPages = Number(argv[++i]);
    else if (a === '--strict-pages') opts.strictPages = true;
    else if (a === '--allow-overflow') opts.strictPages = false;
    else if (a === '--skip-fact-check') opts.skipFactCheck = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/typst/build-typst-cv.mjs --bundle <dir> --out <file.pdf> [--jd jds/...] [--report NNN] [--report-file reports/...] [--max-pages 1] [--allow-overflow] [--skip-fact-check] [--json]');
      process.exit(0);
    }
  }
  return opts;
}

function countPdfPages(pdfPath) {
  // Method 1: pdfinfo
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  if (info.status === 0 && info.stdout) {
    const m = info.stdout.match(/^Pages:\s+(\d+)/m);
    if (m) return Number(m[1]);
  }
  // Method 2: pdftotext form feeds
  const txt = spawnSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  if (txt.status === 0 && txt.stdout) {
    const feeds = (txt.stdout.match(/\f/g) || []).length;
    if (feeds > 0) return feeds;
  }
  // Method 3: PDF page object count fallback
  const raw = readFileSync(pdfPath, 'latin1');
  const matches = raw.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 1;
}

function nextOverflowPath(pdfPath) {
  const base = pdfPath.replace(/\.pdf$/i, '');
  let candidate = `${base}.overflow.pdf`;
  let idx = 2;
  while (existsSync(candidate)) {
    candidate = `${base}.overflow-${idx}.pdf`;
    idx++;
  }
  return candidate;
}

function registerPdfIndex(reportNum, pdfPath, bundleDir) {
  const dataDir = join(ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const indexPath = join(dataDir, 'pdf-index.tsv');
  const header = 'report\tpdf\tsource\tformat\tdate\tkind';
  const today = new Date().toISOString().slice(0, 10);
  const relPdf = relative(ROOT, pdfPath);
  const relSource = relative(ROOT, bundleDir);
  const padded = String(reportNum).padStart(3, '0');
  const newRow = `${padded}\t${relPdf}\t${relSource}\ta4\t${today}\tcv-typst`;

  let rows = [];
  if (existsSync(indexPath)) {
    const lines = readFileSync(indexPath, 'utf8').split(/\r?\n/).filter(Boolean);
    rows = lines.slice(1).filter((line) => {
      const [rep, pdf] = line.split('\t');
      return !(rep === padded && pdf === relPdf);
    });
  }
  rows.push(newRow);
  writeFileSync(indexPath, [header, ...rows].join('\n') + '\n', 'utf8');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.bundle || !opts.out) {
    console.error('Error: --bundle and --out are required.');
    process.exit(1);
  }

  const bundleDir = resolve(process.cwd(), opts.bundle);
  const outPdf = resolve(process.cwd(), opts.out);
  const tailoredMd = join(bundleDir, 'cv-tailored.md');
  const aboutYml = join(bundleDir, 'about.yml');

  if (!existsSync(bundleDir)) {
    console.error(`Bundle directory not found: ${bundleDir}`);
    process.exit(1);
  }
  if (!existsSync(tailoredMd)) {
    console.error(`Missing ${tailoredMd} — run select-from-bank.mjs apply first.`);
    process.exit(1);
  }

  const report = {
    bundleDir,
    outPdf,
    factCheck: { skipped: opts.skipFactCheck, verdict: 'skipped', output: '' },
    compile: { ok: false, pages: null, maxPages: opts.maxPages, overflowPath: null, bytes: null },
    keywordMatch: null,
    indexed: false,
  };

  // 1. Fact gate
  if (!opts.skipFactCheck) {
    const fc = spawnSync(process.execPath, [join(ROOT, 'verify-cv-facts.mjs'), tailoredMd], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const combined = `${fc.stdout || ''}\n${fc.stderr || ''}`.trim();
    report.factCheck.output = combined;
    if (fc.status !== 0) {
      report.factCheck.verdict = 'block';
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.error('Fact gate BLOCKED build — fix unverified claims in selection before compiling:\n');
        console.error(combined);
      }
      process.exit(2);
    }
    report.factCheck.verdict = 'pass';
  }

  // 2. Compile via Typst to staging file first (so overflow never overwrites final PDF)
  mkdirSync(dirname(outPdf), { recursive: true });
  const stagePdf = `${outPdf}.stage.pdf`;
  const relBundle = relative(ROOT, bundleDir).replace(/\\/g, '/');
  if (relBundle.startsWith('..')) {
    console.error(`Bundle directory must live inside repo root (${ROOT}) so Typst can read YAML files safely.`);
    process.exit(1);
  }

  const typstArgs = [
    'compile',
    'main.typ',
    stagePdf,
    '--font-path',
    'font',
    '--input',
    `data-dir=${relBundle}`,
  ];
  if (existsSync(aboutYml)) {
    typstArgs.push('--input', `about-file=${relBundle}/about.yml`);
  }

  const comp = spawnSync('typst', typstArgs, { cwd: ROOT, encoding: 'utf8' });
  if (comp.status !== 0) {
    if (existsSync(stagePdf)) unlinkSync(stagePdf);
    report.compile.error = (comp.stderr || comp.stdout || 'typst compile failed').trim();
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error('Typst compilation failed:\n', report.compile.error);
    }
    process.exit(1);
  }

  // 3. Page count check
  const pages = countPdfPages(stagePdf);
  report.compile.pages = pages;

  if (pages > opts.maxPages) {
    const overflowPdf = nextOverflowPath(outPdf);
    renameSync(stagePdf, overflowPdf);
    report.compile.ok = false;
    report.compile.overflowPath = overflowPdf;
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.warn(`⚠️  Overflow draft: rendered ${pages} pages (budget: ${opts.maxPages}). Saved draft to ${overflowPdf}`);
      console.warn('Trim lower-priority bullets, projects, or skills in selection.json and rebuild.');
    }
    process.exit(opts.strictPages ? 3 : 0);
  }

  renameSync(stagePdf, outPdf);
  report.compile.ok = true;
  report.compile.bytes = statSync(outPdf).size;

  // 4. Extract real PDF text & optional keyword-match (prefer --report-file if it has keywords, fallback to --jd)
  const extractedTxt = join(bundleDir, 'cv-extracted.txt');
  const pdftxt = spawnSync('pdftotext', [outPdf, extractedTxt], { encoding: 'utf8' });
  if (pdftxt.status === 0) {
    const runKm = (kmArgs) => {
      const km = spawnSync(process.execPath, [join(ROOT, 'keyword-match.mjs'), ...kmArgs, '--cv', extractedTxt, '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      if (km.status === 0 && km.stdout) {
        try {
          return { ok: true, data: JSON.parse(km.stdout) };
        } catch {
          return { ok: true, data: { raw: km.stdout.trim() } };
        }
      }
      return { ok: false, error: (km.stderr || km.stdout || '').trim() };
    };

    let kmResult = null;
    if (opts.reportFile) {
      const reportPath = resolve(ROOT, opts.reportFile);
      if (existsSync(reportPath)) {
        kmResult = runKm([reportPath]);
      }
    }
    if ((!kmResult || !kmResult.ok) && opts.jd) {
      const jdPath = resolve(ROOT, opts.jd);
      if (existsSync(jdPath)) {
        kmResult = runKm(['--jd-text', jdPath]);
      }
    }
    if (kmResult) {
      report.keywordMatch = kmResult.ok ? kmResult.data : { error: kmResult.error };
    }
  }

  // 5. Index in data/pdf-index.tsv
  if (opts.report) {
    registerPdfIndex(opts.report, outPdf, bundleDir);
    report.indexed = true;
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`✅ PDF generated: ${outPdf} (${pages} page${pages > 1 ? 's' : ''}, ${(report.compile.bytes / 1024).toFixed(1)} KB)`);
    console.log(`   Fact gate: ${report.factCheck.verdict}`);
    const cov = report.keywordMatch?.coveragePct ?? report.keywordMatch?.coveragePercent;
    if (typeof cov === 'number') {
      console.log(`   ATS keyword coverage: ${cov}% (${report.keywordMatch.presentCount ?? '?'}/${report.keywordMatch.total ?? '?'})`);
    }
    if (report.indexed) {
      console.log(`   Indexed in data/pdf-index.tsv (report #${opts.report})`);
    }
  }
}

main();
