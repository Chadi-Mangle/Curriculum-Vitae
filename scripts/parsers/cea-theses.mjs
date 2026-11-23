#!/usr/bin/env node
/**
 * Zero-token local parser for CEA Thèses (Mathématiques, information scientifique, logiciel).
 * Reads the official CEA RSS feed (`Rss_Profile=1898`), filters strictly to PhD/Thèse offers
 * matching Cloud, Scheduling, Pipelines/Workflows, Distributed Systems, PQC/ML-KEM/Cryptography,
 * Agentic AI, or Networks, and emits jobs-json-v1 JSON with exact pubDate (`postedAt`).
 */

const FEED_URLS = [
  'https://www.theses-postdocs.cea.fr/handlers/offerRss.ashx?LCID=1036&Rss_Profile=1898', // Mathématiques, info scientifique, logiciel
  'https://www.theses-postdocs.cea.fr/handlers/offerRss.ashx?LCID=1036&Rss_Profile=1909', // Systèmes d'information
  'https://www.theses-postdocs.cea.fr/handlers/offerRss.ashx?LCID=1036&Rss_Profile=2237', // Défis technologiques
  'https://www.theses-postdocs.cea.fr/handlers/offerRss.ashx?LCID=1036&Rss_Profile=1921', // Sciences pour l'ingénieur
];

const FOCUS_RE =
  /\b(cloud|kubernetes|k8s|orchestration|scheduling|ordonnancement|placement|resource allocation|allocation de ressources|distributed systems|syst[eè]mes distribu[eé]s|edge[- ]to[- ]cloud|continuum|batch scheduling|gpu|inference|inf[eé]rence|llm|agentic|agentique|multi[- ]agent|workflow|pipeline|dag|microservice|containers?|conteneurs?|serverless|5g|6g|telecom|t[eé]l[eé]com|network automation|pqc|post[- ]?quantum|post[- ]?quantique|ml[- ]?kem|kyber|cryptograph\w*|cybers[eé]curit[eé]|s[eé]curit[eé] informatique)\b/i;

const EXCLUDE_RE =
  /\b(java|jee|spring boot|post[- ]?doc|post[- ]?doctoral|stage|intern|plasma|tokamak|fusion|nucl[eé]aire|neutronique|cosmolog|galaxie|quarks|gluons|zirconium|biolog|mol[eé]cul|cellul|clinique|m[eé]dical|fpga|firmware|pcb|chiplet|embedded|embarqu[eé]|électrode|supraconduct|nappe liquide|convertisseurs? de puissance|antennes?|mimo|reram|neuromorph|multiphysique)\b/i;

function cleanXml(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const jobs = [];
  const seen = new Set();

  for (const feedUrl of FEED_URLS) {
    const res = await fetch(feedUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) continue;
    const xml = await res.text();

    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const item = match[1];
      const cats = [...item.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map((m) => cleanXml(m[1]));
      const isThesis = cats.some((c) => /th[eè]se|phd|doctor/i.test(c));
      const rawTitle = cleanXml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
      const url = cleanXml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
      const desc = cleanXml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1]);
      const pubRaw = cleanXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);

      if (!url || !rawTitle || seen.has(url)) continue;
      if (!isThesis && !/th[eè]se|phd|cifre|doctor/i.test(rawTitle)) continue;
      seen.add(url);

      const searchable = `${rawTitle} ${desc}`;
      if (EXCLUDE_RE.test(searchable)) continue;
      if (!FOCUS_RE.test(searchable)) continue;

      const parsedDate = pubRaw ? Date.parse(pubRaw) : NaN;
      const postedAt = !Number.isNaN(parsedDate) ? new Date(parsedDate).toISOString().slice(0, 10) : undefined;
      const title = /th[eè]se|phd|cifre|doctor/i.test(rawTitle) ? rawTitle : `[Thèse CEA] ${rawTitle}`;

      jobs.push({
        title,
        url,
        company: 'CEA',
        location: 'France',
        ...(postedAt ? { postedAt } : {}),
        description: desc.slice(0, 600),
      });
    }
  }

  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`cea-theses parser error: ${err.message}`);
  process.exit(1);
});
