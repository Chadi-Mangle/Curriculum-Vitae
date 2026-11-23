#!/usr/bin/env node
/**
 * Zero-token local parser for ONERA DTIS (Traitement de l'information et systèmes) PhD proposals.
 * Reads https://w3.onera.fr/formationparlarecherche/fr/theses-dtis and emits jobs-json-v1 JSON.
 */

const BASE_URL = 'https://w3.onera.fr';
const LIST_URL = `${BASE_URL}/formationparlarecherche/fr/theses-dtis`;

const FOCUS_RE =
  /cloud|kubernetes|k8s|orchestrat|schedul|ordonnanc|placement|resource allocation|allocation de ressources|distribut|distribu[eé]|edge[- ]to[- ]cloud|continuum|cluster|batch|gpu|infer|llm|agent|workflow|pipeline|dag|network|r[eé]seau|telecom|5g|6g|pqc|post[- ]?quantum|post[- ]?quantique|ml[- ]?kem|kyber|cryptograph|cybers[eé]curit|security|s[eé]curit[eé]/i;

const EXCLUDE_RE =
  /\b(java|jee|spring boot|post[- ]?doc|stage|intern|fpga|firmware|pcb|chiplet|embedded|embarqu[eé]|radar|optique|a[eé]rodynam|acoustique|mat[eé]riaux)\b/i;

function decodeEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const res = await fetch(LIST_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`ONERA HTTP ${res.status}`);
  const html = await res.text();

  const todayIso = new Date().toISOString().slice(0, 10);
  const jobs = [];
  const seen = new Set();

  for (const m of html.matchAll(/<a[^>]+href="(\/formationparlarecherche\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const rel = m[1];
    if (/\/theses-d[a-z]{3}$|\/fr$|\/en$/i.test(rel)) continue;
    const rawTitle = decodeEntities(m[2]);
    if (rawTitle.length < 20) continue;

    const url = `${BASE_URL}${rel}`;
    if (seen.has(url)) continue;
    seen.add(url);

    if (EXCLUDE_RE.test(rawTitle)) continue;
    if (!FOCUS_RE.test(rawTitle)) continue;

    const title = /th[eè]se|phd|doctor|cifre/i.test(rawTitle) ? rawTitle : `[Thèse ONERA DTIS] ${rawTitle}`;
    jobs.push({
      title,
      url,
      company: 'ONERA (DTIS)',
      location: 'France',
      postedAt: todayIso,
      description: rawTitle,
    });
  }

  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`onera-theses parser error: ${err.message}`);
  process.exit(1);
});
