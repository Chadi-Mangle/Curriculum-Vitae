#!/usr/bin/env node
/**
 * Zero-token local parser for the French National Doctoral Portal (Plateforme nationale du doctorat):
 * https://app.doctorat.gouv.fr/api/propositions-these (aggregates ADUM & French doctoral schools).
 *
 * Fetches all currently open PhD & CIFRE thesis proposals (~500 total across France),
 * filters out assigned or expired proposals, keeps Computer Science / STIC subjects matching
 * Cloud, Scheduling / Ordonnancement, Pipelines / Workflows / DAG, Distributed Systems,
 * Kubernetes, Inference / GPU / HPC / Heterogeneous targets, Agentic AI, PQC / ML-KEM /
 * Cryptography / Cybersecurity, and 5G/6G / Networks (excluding Java & non-CS domains).
 */

const API_BASE = 'https://app.doctorat.gouv.fr/api/propositions-these';
const PAGE_SIZE = 100;
const MAX_PAGES = 12;

const CS_SPECIALTY_RE =
  /informatique|computer|r[eé]seau|network|t[eé]l[eé]com|cyber|s[eé]curit|calcul|hpc|syst[eè]me|donn[eé]es|intelligence artificielle|stic|math[eé]matiques appliqu/i;

const FOCUS_RE =
  /\b(cloud|kubernetes|k8s|orchestrat\w*|schedul\w*|ordonnanc\w*|workload placement|task placement|placement de t[aâ]ches|placement de services|resource allocation|allocation de ressources|distribut\w* systems?|syst[eè]mes? distribu[eé]s?|syst[eè]mes? r[eé]partis?|edge[- ]to[- ]cloud|continuum num[eé]rique|cloud[- ]edge|f[eé]d[eé]ration de clusters?|cluster\w*|batch scheduling|gpu|ai inference|llm inference|ml inference|outils d'inf[eé]rence|moteur d'inf[eé]rence|inf[eé]rence ia|model serving|vllm|hpc|high[- ]performance computing|calcul haute performance|mlir|llvm|compilat\w*|heterogeneous (?:hardware|clusters?|architectures?|computing)|cibles mat[eé]rielles|llm|grands mod[eè]les de langage|agentic|agentique|agents? d'ia|multi[- ]agent|workflow\w*|pipeline\w*|dag|microservice\w*|container\w*|conteneur\w*|serverless|5g|6g|network automation|r[eé]seaux? mobiles?|r[eé]seaux? p[eé]riph[eé]riques?|pqc|post[- ]?quant\w*|ml[- ]?kem|kyber|cryptograph\w*|cybers[eé]curit[eé]|cyberd[eé]fense|s[eé]curit[eé] informatique|kaslr|ebpf|virtualis\w*|virtualiz\w*)\b/i;

const EXCLUDE_RE =
  /\b(java|jee|spring boot|biolog\w*|bioproc[eé]d[eé]\w*|bior[eé]acteur\w*|cellul\w*|mol[eé]cul\w*|prot[eé]in\w*|cancer|clinique|m[eé]dical\w*|sepsis|hospitali\w*|pharmaceut\w*|soignants?|personnes [aâ]g[eé]es|neuroimager\w*|microphysiolog\w*|osmotique\w*|moustiques?|agricol\w*|chimie|radicaux|polym[eè]re|agronom\w*|g[eé]olog\w*|oc[eé]anograph\w*|hydrolog\w*|climatolog\w*|m[eé]canique des fluides|combustion|plasma|tokamak|nucl[eé]aire|astrophys\w*|cosmolog\w*|sociolog\w*|g[eé]ograph\w*|histoire|droit|litt[eé]rature|fpga only|pcb|pi[eé]zo[eé]lectr\w*|onduleurs?|batterie\w*|convertisseurs?|a[eé]ronefs? plus [eé]lectriques|feux de for[eê]t|d[eé]chets marins|essaims? de drones?|multi[- ]drones?|robots? sociaux|antennes?|ultra massive mimo|[eé]lectromagn[eé]tique\w*|travailleurs? isol[eé]s?)\b/i;

function cleanText(str) {
  return String(str || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function collectKeywords(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.values(obj).filter(Boolean).join(', ');
}

async function main() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const jobs = [];
  const seen = new Set();

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API_BASE}?page=${page}&size=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops-local-parser/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const content = Array.isArray(data.content) ? data.content : [];
    if (content.length === 0) break;

    for (const t of content) {
      if (!t || !t.id || seen.has(t.id)) continue;
      seen.add(t.id);

      // Skip already assigned theses
      if (String(t.sujetAttribue || '').toLowerCase() === 'oui') continue;

      // Skip expired application deadlines
      const deadline = typeof t.dateLimiteCandidature === 'string' ? t.dateLimiteCandidature.slice(0, 10) : null;
      if (deadline && deadline < todayIso) continue;

      const isStic = String(t.domaineScientifique || '') === '9';
      const specText = `${t.specialite || ''} ${t.ecoleDoctoraleLibelle || ''}`;
      if (!isStic && !CS_SPECIALTY_RE.test(specText)) continue;

      const titleFr = cleanText(t.theseTitre);
      const titleEn = cleanText(t.theseTitreAnglais);
      const rawTitle = titleFr || titleEn;
      if (!rawTitle) continue;

      const kwFr = collectKeywords(t.motsCles);
      const kwEn = collectKeywords(t.motsClesAnglais);
      const resume = cleanText(t.resume || t.resumeAnglais);
      const lab = cleanText(t.uniteRechercheLibelle);
      const headerText = `${rawTitle} ${titleEn} ${kwFr} ${kwEn}`;

      if (EXCLUDE_RE.test(`${headerText} ${lab}`)) continue;
      if (!FOCUS_RE.test(headerText)) continue;

      const finStr = `${t.financementOrigine || ''} ${t.financementEmployeur || ''} ${t.modalitesEncadrement || ''}`;
      const isCifre = /\bcifre\b/i.test(finStr);
      const prefix = isCifre ? '[Thèse CIFRE]' : '[Thèse]';
      const title = /\b(th[eè]se|phd|cifre|doctorat)\b/i.test(rawTitle) ? rawTitle : `${prefix} ${rawTitle}`;

      const employer = cleanText(t.financementEmployeur);
      const etablissement = cleanText(t.etablissementLibelle);
      const companyParts = [employer, lab || etablissement].filter(Boolean);
      const company = companyParts.length > 0 ? companyParts.join(' / ') : 'doctorat.gouv.fr';

      const city = cleanText(t.etablissementVille || t.uniteRechercheVille);
      const location = city ? `${city}, France` : 'France';

      const postedRaw = t.dateMiseEnLigne || t.dateMaj || t.dateCreation;
      const postedAt = typeof postedRaw === 'string' ? postedRaw.slice(0, 10) : undefined;

      jobs.push({
        title,
        url: `https://app.doctorat.gouv.fr/proposition?id=${t.id}`,
        company,
        location,
        ...(postedAt ? { postedAt } : {}),
        description: [
          isCifre ? `Financement: ${cleanText(t.financementOrigine || 'CIFRE')}` : (t.financementOrigine ? `Financement: ${cleanText(t.financementOrigine)}` : ''),
          deadline ? `Date limite: ${deadline}` : '',
          kwFr || kwEn ? `Mots-clés: ${kwFr || kwEn}` : '',
          resume.slice(0, 450),
        ].filter(Boolean).join(' | '),
      });
    }

    if (data.last === true || page + 1 >= (data.totalPages || 0)) break;
  }

  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  console.error(`doctorat-gouv parser error: ${err.message}`);
  process.exit(1);
});
