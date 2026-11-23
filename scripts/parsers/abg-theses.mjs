#!/usr/bin/env node
/**
 * Zero-token local parser for ABG (Association Bernard Gregory) Thèses & CIFRE
 * focused strictly on Cloud, Scheduling / Ordonnancement, Pipelines / Workflows / DAG,
 * Distributed Systems, Kubernetes, Inference / GPU, Agentic AI, and Networks.
 */

const BASE_URL = 'https://emploi.abg.asso.fr';
const MAX_PAGES = 20;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

const FOCUS_RE =
  /\b(cloud|kubernetes|k8s|orchestrat\w*|schedul\w*|ordonnanc\w*|placement|resource allocation|allocation de ressources|distribut\w*|distribu[eé]\w*|edge[- ]to[- ]cloud|continuum|cluster|batch|gpu|infer\w*|inf[eé]rence|llm|agent\w*|workflow|pipeline|dag|microservice|container\w*|conteneur\w*|serverless|network\w*|r[eé]seau\w*|telecom\w*|t[eé]l[eé]com\w*|5g|6g|pqc|post[- ]?quant\w*|ml[- ]?kem|kyber|cryptograph\w*|cybers[eé]curit[eé]|s[eé]curit[eé] informatique|devops|sre|optimis\w*|syst[eè]mes? informatique\w*|software|logiciel)\b/i;

const EXCLUDE_RE =
  /\b(java|jee|spring boot|biolog|cellul|chimie|polym[eè]re|bact[eé]ri|cancer|clinique|m[eé]dical|c[eé]r[eé]bral|vasculair|avc|stroke|agronom|sols alpins|hydrolyse|amidon|papeti[eè]re|turbines?|hydropower|acoustique|fluide|thermofluid|photoni|spectrom|bovine|embryo|v[eé]g[eé]tal|quarks|gluons|dileptons|lhcb|g[eé]ograph|sociolog|histoire|droit|psycholog|neuroscien|mat[eé]riaux|m[eé]canique|ciment|b[eé]ton|moyenne tension|électromagnétique|fpga|firmware|pcb|chiplet|embedded|embarqu[eé])\b/i;

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
    .replace(/&icirc;/g, 'î')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ugrave;/g, 'ù')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFrDate(ddmmyyyy) {
  const m = String(ddmmyyyy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function fetchPage(page) {
  const params = new URLSearchParams();
  params.set('criteria[id_type_offre]', '2'); // Sujet de Thèse
  params.set('commit', '1');

  const res = await fetch(`${BASE_URL}/fr/candidatOffres/recherche/page/${page}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const cards = html.split(/<div class="offre[^"]*"/i).slice(1);
  const items = [];
  for (const card of cards) {
    const linkMatch = card.match(/<a[^>]+href="(\/fr\/candidatOffres\/show\/id_offre\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = `${BASE_URL}${linkMatch[1]}`;
    const id = linkMatch[2];
    const rawTitle = decodeEntities(linkMatch[3]);
    const typeMatch = card.match(/<span class=['"]type['"]>([^<]+)<\/span>/i);
    const offerType = typeMatch ? decodeEntities(typeMatch[1]) : 'Thèse';
    if (!/th[eè]se|phd|doctor/i.test(offerType) && !/th[eè]se|phd|cifre|doctor/i.test(rawTitle)) continue;

    const socMatch = card.match(/<div class="societe">([\s\S]*?)<\/div>/i);
    const company = socMatch
      ? decodeEntities(socMatch[1].replace(/<span class=['"]type['"][\s\S]*?<\/span>/i, ''))
      : 'ABG';

    const locMatch = card.match(/<div class="adresse">([\s\S]*?)<\/div>/i);
    const location = locMatch
      ? decodeEntities(locMatch[1]).replace(/\s*,\s*/g, ', ')
      : 'France';

    const descMatch = card.match(/<div class="text">([\s\S]*?)<\/div>/i);
    const desc = descMatch ? decodeEntities(descMatch[1]) : '';

    const expMatch = card.match(/<div class="expertises">([\s\S]*?)<\/div>/i);
    const expertises = expMatch ? decodeEntities(expMatch[1]) : '';

    const dateMatch = card.match(/(\d{2}\/\d{2}\/20\d\d)/);
    const postedAt = dateMatch ? parseFrDate(dateMatch[1]) : undefined;

    const searchable = `${rawTitle} ${expertises} ${desc}`;
    if (EXCLUDE_RE.test(searchable)) continue;
    if (!FOCUS_RE.test(`${rawTitle} ${expertises}`)) continue;

    const title = /th[eè]se|phd|cifre|doctor/i.test(rawTitle) ? rawTitle : `[Thèse] ${rawTitle}`;

    items.push({
      id,
      title,
      url,
      company: company || 'ABG',
      location: location || 'France',
      ...(postedAt ? { postedAt } : {}),
      description: `${expertises ? `[${expertises}] ` : ''}${desc}`.trim(),
    });
  }
  return items;
}

async function main() {
  const byId = new Map();
  const cutoffMs = Date.now() - MAX_AGE_MS;
  for (let p = 1; p <= MAX_PAGES; p++) {
    try {
      const list = await fetchPage(p);
      let anyRecent = false;
      for (const item of list) {
        if (item.postedAt) {
          const ts = Date.parse(item.postedAt);
          if (!Number.isNaN(ts) && ts >= cutoffMs) anyRecent = true;
        } else {
          anyRecent = true;
        }
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
      if (list.length > 0 && !anyRecent && p >= 4) break;
    } catch {
      // Skip transient page failure
    }
  }

  const jobs = [...byId.values()].map(({ id, ...rest }) => rest);
  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`abg-theses parser error: ${err.message}`);
  process.exit(1);
});
