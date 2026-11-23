#!/usr/bin/env node
/**
 * doctor.mjs — Lightweight workflow health check for Typst × career-ops × humanizer.
 *
 * Checks only what this workflow actually uses:
 *   1. Required CLI tools (Node >= 22.13, typst, pdftotext, pdfinfo, pdfunite)
 *   2. Personal user-layer files (content/yaml/info.yml, *-all.yml, cv.md,
 *      config/profile.yml, modes/_profile.md, modes/_custom.md)
 *   3. Portal configs (portals.yml, portals.cdi-vie.yml), local parsers, and provider resolution
 *   4. Typst templates, local fonts, agent skills, and static dossier PDFs (documents/notes.pdf)
 *
 * Usage:
 *   node doctor.mjs          # human-readable checklist
 *   node doctor.mjs --json   # JSON summary
 *   node doctor.mjs --help   # show usage
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { loadProviders, resolveProvider } from './providers/_registry.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node doctor.mjs [--json] [--help]');
  process.exit(0);
}

const JSON_OUT = argv.includes('--json');
const checks = [];
const errors = [];
const warnings = [];

function pass(name, detail = '') {
  checks.push({ name, status: 'pass', detail });
}

function warn(name, detail) {
  checks.push({ name, status: 'warn', detail });
  warnings.push(`${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ name, status: 'fail', detail });
  errors.push(`${name}: ${detail}`);
}

function checkCmd(bin, versionArgs = ['--version']) {
  const res = spawnSync(bin, versionArgs, { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    fail(`cli:${bin}`, `not found in PATH`);
    return;
  }
  const line = (res.stdout || res.stderr || '').split(/\r?\n/).find(Boolean)?.trim() || 'ok';
  pass(`cli:${bin}`, line);
}

function checkYamlFile(relPath, required = true) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) {
    const msg = `missing (copy from ${relPath.replace(/(\.[^.]+)$/, '.example$1')})`;
    if (required) fail(relPath, msg);
    else warn(relPath, msg);
    return null;
  }
  try {
    const data = yaml.load(readFileSync(full, 'utf8'));
    if (data == null) {
      fail(relPath, 'YAML file is empty');
      return null;
    }
    pass(relPath, 'valid YAML');
    return data;
  } catch (err) {
    fail(relPath, `invalid YAML (${err.message})`);
    return null;
  }
}

function checkNonEmptyFile(relPath, required = true) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) {
    if (required) fail(relPath, 'missing');
    else warn(relPath, 'missing');
    return false;
  }
  const size = readFileSync(full, 'utf8').trim().length;
  if (size === 0) {
    if (required) fail(relPath, 'empty');
    else warn(relPath, 'empty');
    return false;
  }
  pass(relPath, `${size} chars`);
  return true;
}

// 1. Node & external CLI tools
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 13)) {
  pass('cli:node', `v${process.versions.node}`);
} else {
  fail('cli:node', `v${process.versions.node} (requires >= 22.13)`);
}
checkCmd('typst', ['--version']);
checkCmd('pdftotext', ['-v']);
checkCmd('pdfinfo', ['-v']);
checkCmd('pdfunite', ['-v']);

// 2. Personal info & master CV bank
const info = checkYamlFile('content/yaml/info.yml', true);
if (info) {
  const requiredKeys = ['full_name', 'email', 'phone', 'github', 'linkedin'];
  const missingKeys = requiredKeys.filter((k) => !String(info[k] ?? '').trim());
  if (missingKeys.length > 0) {
    fail('content/yaml/info.yml:fields', `missing required keys: ${missingKeys.join(', ')}`);
  } else {
    pass('content/yaml/info.yml:fields', 'all required contact keys present');
  }
}

for (const bank of [
  'content/yaml/experience-all.yml',
  'content/yaml/projects-all.yml',
  'content/yaml/skills-all.yml',
  'content/yaml/about-all.yml',
  'content/yaml/education-all.yml',
]) {
  checkYamlFile(bank, true);
}

checkNonEmptyFile('cv.md', true);
checkYamlFile('config/profile.yml', true);
checkNonEmptyFile('modes/_profile.md', true);
checkNonEmptyFile('modes/_custom.md', true);

// 3. Portal configs, local parsers & providers
const providers = await loadProviders(join(ROOT, 'providers'));
pass('providers', `${providers.size} loaded`);

for (const portalsFile of ['portals.yml', 'portals.cdi-vie.yml']) {
  const cfg = checkYamlFile(portalsFile, portalsFile === 'portals.yml');
  if (!cfg) continue;
  const bad = [];
  for (const company of cfg.tracked_companies || []) {
    if (!company.enabled || company.scan_method === 'websearch') continue;
    const res = resolveProvider(company, providers);
    if (!res || res.error) {
      bad.push(`${company.name} (${res?.error || 'no matching provider'})`);
    }
    if (company.parser?.script && !existsSync(join(ROOT, company.parser.script))) {
      bad.push(`${company.name} (missing parser ${company.parser.script})`);
    }
  }
  if (bad.length > 0) {
    fail(`${portalsFile}:providers`, bad.join('; '));
  } else {
    pass(`${portalsFile}:providers`, 'all enabled entries resolved');
  }
}

// 4. Typst templates, fonts, skills & static PDF attachments
checkNonEmptyFile('main.typ', true);
checkNonEmptyFile('cover-letter.typ', true);
const fontDir = join(ROOT, 'font');
if (existsSync(fontDir) && readdirSync(fontDir).some((f) => /\.(ttf|otf)$/i.test(f))) {
  pass('font/', `${readdirSync(fontDir).filter((f) => /\.(ttf|otf)$/i.test(f)).length} font files`);
} else {
  fail('font/', 'missing local font files (.ttf/.otf)');
}

for (const skill of [
  '.agent/skills/typst-cv/SKILL.md',
  '.agent/skills/humanizer/SKILL.md',
  '.agents/skills/career-ops/SKILL.md',
]) {
  checkNonEmptyFile(skill, true);
}

if (existsSync(join(ROOT, 'documents/notes.pdf'))) {
  pass('documents/notes.pdf', 'present for make merge-dossiers');
} else {
  warn('documents/notes.pdf', 'not found yet (needed for ADUM dossier merging)');
}

const ok = errors.length === 0;
const summary = {
  ok,
  passed: checks.filter((c) => c.status === 'pass').length,
  warnings,
  errors,
  checks,
};

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`Workflow Doctor — ${ok ? 'OK' : 'FAILED'} (${summary.passed}/${checks.length} passed, ${warnings.length} warnings, ${errors.length} errors)`);
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗';
    console.log(`  ${icon} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
}

process.exit(ok ? 0 : 1);
