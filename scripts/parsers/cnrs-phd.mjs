#!/usr/bin/env node
/**
 * Zero-token local parser for CNRS Emploi doctoral contracts (`/Offres/Doctorant/`).
 * Filters strictly to Cloud, Scheduling / Ordonnancement, Pipelines / Workflows / DAG,
 * Distributed Systems, Kubernetes, Inference / GPU, Agentic AI, PQC / ML-KEM, Networks.
 * Excludes Java and pure low-level hardware / bio / physics / humanities.
 */

const BASE_URL = 'https://emploi.cnrs.fr';
const SEARCH_URL = `${BASE_URL}/Offres/Recherche.aspx?ContractType=Contrat%20doctoral`;

const FOCUS_RE =
  /cloud|kubernetes|k8s|orchestrat|schedul|ordonnanc|placement|resource allocation|allocation de ressources|distribut|distribu[eé]|edge[- ]to[- ]cloud|continuum|cluster|batch|gpu|infer|llm|agent|workflow|pipeline|dag|microservice|container|conteneur|serverless|network|r[eé]seau|telecom|t[eé]l[eé]com|5g|6g|pqc|post[- ]?quantum|post[- ]?quantique|ml[- ]?kem|kyber|cryptograph/i;

const EXCLUDE_RE =
  /\b(java|jee|spring boot|post[- ]?doc|stage|intern|fpga|firmware|pcb|chiplet|embedded|embarqu[eé]|biolog|biophys|chimie|g[eé]ograph|sociolog|histoire|droit|psycholog|photoni|terahertz|nano-opos|mol[eé]cul|cellul|m[eé]dical)\b/i;

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
  const res = await fetch(SEARCH_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`CNRS HTTP ${res.status}`);
  const html = await res.text();

  const todayIso = new Date().toISOString().slice(0, 10);
  const jobs = [];
  const seen = new Set();

  const blocks = html.split(/<a href="(\/Offres\/Doctorant\/[^"]+)"/gi);
  for (let i = 1; i < blocks.length; i += 2) {
    const relUrl = blocks[i];
    const tail = blocks[i + 1] || '';
    const titleMatch = tail.match(/^[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = `${BASE_URL}${relUrl}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const rawTitle = decodeEntities(titleMatch[1]);
    const labMatch = tail.match(/<strong>([\s\S]*?)<\/strong>/i);
    const lab = labMatch ? decodeEntities(labMatch[1]) : '';
    const locMatch = tail.match(/<\/strong>\s*<\/p>\s*<p>([\s\S]*?)<\/p>/i);
    const location = locMatch ? `${decodeEntities(locMatch[1]).replace(/\s*•\s*/g, ', ')}, France` : 'France';

    const searchable = `${rawTitle} ${lab}`;
    if (EXCLUDE_RE.test(searchable)) continue;
    if (!FOCUS_RE.test(searchable)) continue;

    const title = /th[eè]se|phd|doctor|cifre/i.test(rawTitle) ? rawTitle : `[Thèse CNRS] ${rawTitle}`;
    jobs.push({
      title,
      url,
      company: lab ? `CNRS (${lab})` : 'CNRS',
      location,
      postedAt: todayIso,
      description: `${rawTitle}${lab ? ` — ${lab}` : ''}`,
    });
  }

  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`cnrs-phd parser error: ${err.message}`);
  process.exit(1);
});
