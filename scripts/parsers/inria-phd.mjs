#!/usr/bin/env node
/**
 * Zero-token local parser for Inria PhD / Doctoral positions focused on:
 * Cloud, Scheduling / Ordonnancement, Pipelines / Workflows / DAG, Distributed Systems,
 * Kubernetes / Orchestration, Edge-to-Cloud, GPU / Inference, Agentic AI, Networks.
 *
 * Excludes low-level hardware / embedded electronics / post-docs / internships.
 */

const BASE_URL = 'https://jobs.inria.fr';
const LIST_URL = `${BASE_URL}/public/classic/fr/offres`;

function decodeEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&uuml;/g, 'ü')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FOCUS_RE =
  /cloud|kubernetes|k8s|orchestrat|schedul|ordonnanc|placement|resource allocation|allocation de ressources|distribut|distribu[eé]|edge[- ]to[- ]cloud|continuum|cluster|batch|gpu|infer|llm|agent|workflow|pipeline|dag|microservice|container|conteneur|serverless|network|r[eé]seau|telecom|t[eé]l[eé]com|5g|6g|pqc|post[- ]?quantum|post[- ]?quantique|ml[- ]?kem|kyber|cryptograph|reliab|fiabilit|fault[- ]?toleran/i;

const PHD_RE = /\b(phd|ph\.d|th[eè]se|doctorant|doctoral|doctorat|cifre)\b/i;
const EXCLUDE_RE =
  /\b(java|jee|spring boot|post[- ]?doc|post[- ]?doctoral|post[- ]?doctorant|internship|stage|master|chiplet|fpga|firmware|pcb|cache|caches|m[eé]moires cache|embedded|embarqu[eé]|browser extension|biolog|mol[eé]cul|cellul|m[eé]dical|quantum information|embryo|bovine|fluid|acousti)\b/i;

async function main() {
  const res = await fetch(LIST_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Inria HTTP ${res.status}`);
  const html = await res.text();

  const blocks = html.split(/<a class="list-offres-link/i).slice(1);
  const todayIso = new Date().toISOString().slice(0, 10);
  const jobs = [];
  const seen = new Set();

  for (const block of blocks) {
    const hrefMatch = block.match(/href="(\/public\/classic\/fr\/offres\/[^"]+)"/i);
    const titleMatch = block.match(/>([\s\S]*?)<\/a>/i);
    if (!hrefMatch || !titleMatch) continue;

    const url = `${BASE_URL}${hrefMatch[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const rawTitle = decodeEntities(titleMatch[1]);
    if (!PHD_RE.test(rawTitle) || EXCLUDE_RE.test(rawTitle)) continue;

    const cityMatch = block.match(/<b>Ville<\/b>\s*:\s*([^<\n]+)/i);
    const teamMatch = block.match(/<b>[ÉE]quipe Inria<\/b>\s*:\s*([^<\n]+)/i);
    const deadlineMatch = block.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/i);

    const deadline = deadlineMatch ? deadlineMatch[1] : null;
    if (deadline && deadline < todayIso) continue;

    const city = cityMatch ? decodeEntities(cityMatch[1]) : 'France';
    const team = teamMatch ? decodeEntities(teamMatch[1]) : '';
    const searchable = `${rawTitle} ${team}`;
    if (!FOCUS_RE.test(searchable)) continue;

    jobs.push({
      title: rawTitle,
      url,
      company: team ? `Inria (${team})` : 'Inria',
      location: city.toLowerCase().includes('france') ? city : `${city}, France`,
      postedAt: todayIso,
      description: `${rawTitle}${team ? ` — Team: ${team}` : ''}${deadline ? ` — Apply before ${deadline}` : ''}`,
    });
  }

  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`inria-phd parser error: ${err.message}`);
  process.exit(1);
});
