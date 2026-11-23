#!/usr/bin/env node
/**
 * scripts/typst/select-from-bank.mjs
 *
 * Deterministic JD scoring & manifest application over `content/yaml/*-all.yml`.
 *
 * Subcommands:
 *   score <jd-file> [--archetype <id>] [--track <cifre-phd|cdi-fr|vie>]
 *                   [--lang <en|fr>] [--include-planned] [--include-unconfirmed]
 *                   [--emit-selection <out.json>] [--json]
 *
 *   apply <selection.json> --out-dir <bundle-dir> [--sync-default] [--json]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { SYNONYMS, countOccurrences, normalizeText } from '../../keyword-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// Weighted keywords per archetype: signature domain signals carry weight 3,
// shared/baseline infrastructure terms carry weight 1 so specialized roles
// (inference-infra, embedded-sec, network-5g6g, sched-agentic) are not drowned out.
const ARCHETYPE_KEYWORDS = {
  'platform-sre': [
    ['platform engineer', 3], ['platform engineering', 3], ['sre', 3], ['site reliability', 3],
    ['devops', 3], ['internal developer platform', 3], ['idp', 2], ['gitops', 2],
    ['argocd', 1.5], ['helm', 1], ['kustomize', 1], ['openshift', 1.5], ['okd', 1.5],
    ['terraform', 1], ['iac', 1.5], ['ci/cd', 1], ['observability', 1], ['vault', 1],
    ['bats', 1.5], ['kubernetes', 1], ['k8s', 1], ['aws', 0.5], ['docker', 0.5],
  ],
  'inference-infra': [
    ['inference', 3], ['gpu', 3], ['gpu scheduling', 4], ['device plugin', 4],
    ['model serving', 4], ['llm serving', 4], ['vllm', 3], ['triton', 3],
    ['vulkan', 3], ['heterogeneous', 2.5], ['cuda', 2.5], ['accelerator', 2.5],
    ['ml infrastructure', 3], ['ai infrastructure', 3], ['kubernetes operator', 2],
    ['kueue', 2.5], ['volcano', 2.5], ['dra', 2],
  ],
  'embedded-sec': [
    ['post-quantum', 4], ['post-quantique', 4], ['pqc', 4], ['ml-kem', 4], ['kyber', 4],
    ['embedded security', 4], ['sécurité embarquée', 4], ['hardware acceleration', 3],
    ['fpga', 3], ['esp32', 3], ['rtos', 2.5], ['iot security', 3], ['firmware', 2.5],
    ['embedded', 2], ['embarqué', 2], ['cryptography', 2.5], ['cryptographie', 2.5],
    ['rust', 1.5], ['arm', 1], ['pcb', 2],
  ],
  'network-5g6g': [
    ['5g', 4], ['6g', 4], ['core network', 3.5], ['network automation', 3.5],
    ['ztp', 3.5], ['zero-touch', 3.5], ['nfv', 3], ['sdn', 3],
    ['mobile network', 3], ['réseaux mobiles', 3], ['telecom', 2.5], ['télécom', 2.5],
    ['bgp', 2], ['routing', 1.5],
  ],
  'sched-agentic': [
    ['scheduling', 3.5], ['ordonnancement', 3.5], ['pipeline scheduling', 4],
    ['batch scheduling', 3.5], ['dag', 3], ['workflow orchestration', 3],
    ['resource allocation', 2.5], ['kubernetes scheduler', 3.5],
    ['agentic', 3.5], ['agentique', 3.5], ['multi-agent', 3.5],
    ['llm serving', 2], ['cifre', 1.5], ['phd', 1], ['thèse', 1], ['doctorat', 1],
  ],
};

const TRACK_ARCHETYPE_PRIORITY = {
  'cifre-phd': ['sched-agentic', 'embedded-sec', 'inference-infra', 'network-5g6g', 'platform-sre'],
  'cdi-fr': ['platform-sre', 'inference-infra', 'embedded-sec', 'network-5g6g', 'sched-agentic'],
  'vie': ['platform-sre', 'network-5g6g', 'inference-infra', 'embedded-sec', 'sched-agentic'],
};

const SECTION_TITLES = {
  en: {
    about_me: 'About me',
    skills: 'Technical skills',
    profile: 'Profile',
    experience: 'Experience',
    education: 'Education',
    projects: 'Projects',
  },
  fr: {
    about_me: 'À propos',
    skills: 'Compétences techniques',
    profile: 'Profil',
    experience: 'Expériences',
    education: 'Formation',
    projects: 'Projets',
  },
};

function loadYamlFile(relPath, required = true) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) {
    if (required) throw new Error(`Missing file: ${relPath}`);
    return null;
  }
  return yaml.load(readFileSync(full, 'utf8'));
}

function loadInfo() {
  return loadYamlFile('content/yaml/info.yml', false) || {};
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandSynonyms(term) {
  const norm = normalizeText(term);
  const forms = new Set([norm]);
  for (const group of SYNONYMS) {
    if (group.includes(norm)) {
      for (const g of group) forms.add(g);
    }
  }
  // Additional domain synonyms
  const extra = [
    ['golang', 'go'],
    ['ci-cd', 'ci/cd', 'cicd'],
    ['okd', 'openshift'],
    ['pqc', 'post-quantum', 'post quantum'],
    ['ztp', 'zero-touch provisioning', 'zero touch provisioning'],
    ['k8s', 'kubernetes'],
    ['rtos', 'real-time', 'temps réel'],
    ['scheduling', 'ordonnancement'],
  ];
  for (const group of extra) {
    if (group.includes(norm)) {
      for (const g of group) forms.add(g);
    }
  }
  return [...forms];
}

function matchesInText(term, text) {
  const clean = String(term).replace(/^sub:/, '').replace(/-/g, ' ');
  for (const form of expandSynonyms(clean)) {
    if (countOccurrences(form, text) > 0) return true;
  }
  if (clean !== term && countOccurrences(term.replace(/^sub:/, ''), text) > 0) return true;
  return false;
}

function detectTrack(jdText) {
  const norm = normalizeText(jdText);
  if (/\b(cifre|phd|ph\.d|doctorant|doctorat|thèse|these|doctoral|research lab|laboratoire)\b/i.test(norm)) {
    return 'cifre-phd';
  }
  if (/\b(v\.?i\.?e\.?|volontariat international|business france)\b/i.test(norm)) {
    return 'vie';
  }
  return 'cdi-fr';
}

function detectLang(jdText, track) {
  // PhD / CIFRE applications in Computer Science are always 100% English.
  // Also, the master YAML bank (experience-all, projects-all, skills-all, education) is in English,
  // so defaulting to 'en' guarantees single-language consistency (no mixed FR/EN CVs).
  if (track === 'cifre-phd') return 'en';
  const frMarkers = ['nous recherchons', 'missions', 'profil recherché', 'compétences', 'poste', 'cdi', 'expérience', 'équipe'];
  const enMarkers = ['responsibilities', 'requirements', 'qualifications', 'about the role', 'we are looking for', 'experience with'];
  let fr = 0;
  let en = 0;
  for (const m of frMarkers) if (countOccurrences(m, jdText) > 0) fr++;
  for (const m of enMarkers) if (countOccurrences(m, jdText) > 0) en++;
  return fr > en ? 'fr' : 'en';
}

function detectMarket(jdText, track) {
  if (track === 'vie') return 'international';
  if (track === 'cdi-fr') return 'france';
  const norm = normalizeText(jdText);
  const frHits = /\b(france|paris|palaiseau|grenoble|toulouse|rennes|lyon|sophia antipolis|lannion|evry|gif-sur-yvette|saclay|cifre|anrt|adum|cnrs|inria|cea|onera|inserm|t[eé]l[eé]com paris|t[eé]l[eé]com sudparis|[eé]cole doctorale|th[eè]se)\b/i.test(norm);
  const intlHits = /\b(switzerland|suisse|zurich|geneva|gen[eè]ve|epfl|eth zurich|united kingdom|london|netherlands|amsterdam|delft|belgium|brussels|usa|united states|canada|singapore)\b/i.test(norm);
  if (frHits) return 'france';
  if (intlHits) return 'international';
  return 'france';
}

function detectArchetype(jdText, track) {
  const scores = {};
  for (const [arch, weightedKeywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    let total = 0;
    for (const entry of weightedKeywords) {
      const [kw, weight] = Array.isArray(entry) ? entry : [entry, 1];
      if (matchesInText(kw, jdText)) total += weight;
    }
    scores[arch] = Number(total.toFixed(1));
  }
  const priority = TRACK_ARCHETYPE_PRIORITY[track] || Object.keys(ARCHETYPE_KEYWORDS);
  const ranked = Object.entries(scores).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return priority.indexOf(a[0]) - priority.indexOf(b[0]);
  });
  return { best: ranked[0][0], scores };
}

function scoreEntry({ archetypes = [], tracks, tags = [], text = '', priority = 2 }, ctx) {
  let score = 0;
  const matchedTags = [];

  if (archetypes.includes(ctx.archetype)) score += 6;
  if (Array.isArray(tracks) && tracks.length > 0) {
    if (tracks.includes(ctx.track)) score += 2;
    else score -= 3;
  }

  for (const tag of tags) {
    if (matchesInText(tag, ctx.jdText)) {
      score += 3;
      matchedTags.push(tag);
    }
  }

  // Light lexical overlap from significant tokens (>=4 chars) in text
  const words = new Set(
    normalizeText(text)
      .split(/[^a-z0-9+#./-]+/)
      .filter((w) => w.length >= 4 && !['with', 'from', 'that', 'this', 'using', 'into', 'over', 'part', 'work', 'worked', 'built', 'multiple'].includes(w)),
  );
  let lexicalHits = 0;
  for (const w of words) {
    if (countOccurrences(w, ctx.jdText) > 0) lexicalHits++;
  }
  score += Math.min(lexicalHits, 5) * 0.5;

  // Priority tie-breaker (1 = highest)
  score += Math.max(0, 4 - (priority || 2)) * 0.4;

  return { score: Number(score.toFixed(2)), matchedTags };
}

function runScore(args) {
  const jdFile = args[0];
  if (!jdFile) {
    console.error('Usage: node scripts/typst/select-from-bank.mjs score <jd-file> [--archetype <id>] [--track <id>] [--lang <en|fr>] [--include-planned] [--include-unconfirmed] [--emit-selection <file.json>] [--json]');
    process.exit(1);
  }
  const jdPath = resolve(process.cwd(), jdFile);
  if (!existsSync(jdPath)) {
    console.error(`JD file not found: ${jdPath}`);
    process.exit(1);
  }
  const jdText = readFileSync(jdPath, 'utf8');

  let archetype = null;
  let track = null;
  let lang = null;
  let market = null;
  let includePlanned = false;
  let includeUnconfirmed = false;
  let emitSelection = null;
  let asJson = false;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--archetype' && args[i + 1]) archetype = args[++i];
    else if (a === '--track' && args[i + 1]) track = args[++i];
    else if (a === '--lang' && args[i + 1]) lang = args[++i];
    else if (a === '--market' && args[i + 1]) market = args[++i];
    else if (a === '--include-planned') includePlanned = true;
    else if (a === '--include-unconfirmed') includeUnconfirmed = true;
    else if (a === '--emit-selection' && args[i + 1]) emitSelection = args[++i];
    else if (a === '--json') asJson = true;
  }

  track = track || detectTrack(jdText);
  lang = lang || detectLang(jdText, track);
  market = market || detectMarket(jdText, track);
  const info = loadInfo();
  const schoolFr = info.school?.france || '';
  const schoolIntl = info.school?.international || schoolFr;
  const schoolName = market === 'france' ? schoolFr : schoolIntl;
  const archDetect = detectArchetype(jdText, track);
  archetype = archetype || archDetect.best;
  const includeEmbeddedSpecialty = ['embedded-sec', 'inference-infra'].includes(archetype);

  const ctx = { jdText, archetype, track, lang };
  const expBank = loadYamlFile('content/yaml/experience-all.yml') || [];
  const projBank = loadYamlFile('content/yaml/projects-all.yml') || [];
  const skillBank = loadYamlFile('content/yaml/skills-all.yml') || [];
  const aboutAll = loadYamlFile('content/yaml/about-all.yml') || {};

  const warnings = [];

  // Score experiences (keep original chronological order, rank items inside)
  const scoredExperiences = expBank.map((exp) => {
    const expScore = scoreEntry(
      { archetypes: exp.archetypes, tracks: exp.tracks, tags: exp.tags, text: `${exp.title} ${exp.description}`, priority: exp.required ? 1 : 2 },
      ctx,
    );
    const items = (exp.items || []).map((item) => {
      const s = scoreEntry(
        { archetypes: item.archetypes || exp.archetypes, tracks: item.tracks || exp.tracks, tags: item.tags, text: `${item.title || ''} ${item.text}`, priority: item.priority },
        ctx,
      );
      return {
        id: item.id,
        title: item.title || null,
        text: item.text,
        status: item.status || 'done',
        score: s.score,
        matchedTags: s.matchedTags,
      };
    }).sort((a, b) => b.score - a.score);

    const maxItems = exp.max_items || items.length;
    const selectedItemIds = items
      .filter((it) => it.status !== 'planned' || includePlanned)
      .slice(0, maxItems)
      .map((it) => it.id);

    return {
      id: exp.id,
      title: exp.title,
      info: exp.info,
      required: Boolean(exp.required),
      score: expScore.score,
      matchedTags: expScore.matchedTags,
      recommended: Boolean(exp.required) || expScore.score >= 3,
      recommendedItemIds: selectedItemIds,
      items,
    };
  });

  // Score projects per group
  const scoredProjectGroups = projBank.map((group) => {
    const items = (group.items || []).map((item) => {
      const s = scoreEntry(
        { archetypes: item.archetypes, tracks: item.tracks, tags: item.tags, text: `${item.name} ${item.description}`, priority: item.priority },
        ctx,
      );
      const blockedByStatus = item.status === 'planned' && !includePlanned;
      const needsConfirm = Boolean(item.confirm_confidentiality) && !includeUnconfirmed;
      if (item.status === 'planned') {
        warnings.push(`Project "${item.name}" (${item.id}) has status=planned — excluded by default unless --include-planned is explicitly set.`);
      }
      if (item.confirm_confidentiality) {
        warnings.push(`Project "${item.name}" (${item.id}) has confirm_confidentiality=true — verify confidentiality with user before external CV.`);
      }
      if (item.status === 'in-progress') {
        warnings.push(`Project "${item.name}" (${item.id}) has status=in-progress — keep in-progress framing truthful.`);
      }
      return {
        id: item.id,
        name: item.name,
        status: item.status || 'done',
        confirm_confidentiality: Boolean(item.confirm_confidentiality),
        excludedByGuard: blockedByStatus || needsConfirm,
        score: s.score,
        matchedTags: s.matchedTags,
      };
    }).sort((a, b) => b.score - a.score);

    const maxItems = group.max_items || 2;
    const selectedItemIds = items
      .filter((it) => !it.excludedByGuard)
      .slice(0, maxItems)
      .map((it) => it.id);

    return {
      id: group.id,
      title: group.title,
      max_items: maxItems,
      recommendedItemIds: selectedItemIds,
      items,
    };
  });

  // Score skills per category
  const scoredSkillGroups = skillBank.map((cat) => {
    const catConfirm = Boolean(cat.confirm_before_cv);
    const skills = (cat.skills || []).map((raw) => {
      const sk = typeof raw === 'string' ? { name: raw, tags: [raw.toLowerCase()], status: 'done', priority: 2 } : raw;
      const s = scoreEntry(
        { archetypes: sk.archetypes || cat.archetypes, tags: sk.tags || [sk.name.toLowerCase()], text: sk.name, priority: sk.priority },
        ctx,
      );
      const needsConfirm = (catConfirm || Boolean(sk.confirm_before_cv) || sk.status === 'in-progress') && !includeUnconfirmed;
      return {
        name: sk.name,
        status: sk.status || 'done',
        confirm_before_cv: catConfirm || Boolean(sk.confirm_before_cv),
        excludedByGuard: (sk.status === 'planned' && !includePlanned) || needsConfirm,
        score: s.score,
        matchedTags: s.matchedTags,
      };
    }).sort((a, b) => b.score - a.score);

    const maxSkills = cat.max_skills || skills.length;
    const catMatchesArch = Array.isArray(cat.archetypes) && cat.archetypes.includes(ctx.archetype);
    const matchedSkillCount = skills.filter((sk) => sk.matchedTags.length > 0).length;
    const skipOptional = Boolean(cat.optional) && !catMatchesArch && matchedSkillCount < 2;
    const selectedSkills = skipOptional
      ? []
      : skills
          .filter((sk) => !sk.excludedByGuard)
          .slice(0, maxSkills)
          .map((sk) => sk.name);

    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      confirm_before_cv: catConfirm,
      recommendedSkills: selectedSkills,
      skills,
    };
  });

  const aboutVariant = aboutAll[archetype]?.[lang] || aboutAll.default?.[lang] || aboutAll.default?.en || {};

  const selectionManifest = {
    schema: 'typst-cv-selection.v1',
    archetype,
    track,
    lang,
    market,
    school_name: schoolName,
    include_embedded_specialty: includeEmbeddedSpecialty,
    allow_planned: includePlanned,
    allow_unconfirmed: includeUnconfirmed,
    about: {
      lang,
      headline: aboutVariant.headline || '',
      about_me: aboutVariant.about_me || '',
      profile: aboutVariant.profile || '',
      sections: SECTION_TITLES[lang] || SECTION_TITLES.en,
    },
    experiences: scoredExperiences
      .filter((e) => e.recommended)
      .map((e) => ({
        id: e.id,
        items: e.recommendedItemIds.map((id) => ({ id })),
      })),
    projects: scoredProjectGroups
      .filter((g) => g.recommendedItemIds.length > 0)
      .map((g) => ({
        id: g.id,
        items: g.recommendedItemIds.map((id) => ({ id })),
      })),
    skills: scoredSkillGroups
      .filter((c) => c.recommendedSkills.length > 0)
      .map((c) => ({
        id: c.id,
        skills: c.recommendedSkills,
      })),
  };

  if (emitSelection) {
    const outPath = resolve(process.cwd(), emitSelection);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(selectionManifest, null, 2) + '\n', 'utf8');
  }

  const result = {
    detected: { track, archetype, lang, archetypeScores: archDetect.scores },
    warnings: [...new Set(warnings)],
    experiences: scoredExperiences,
    projects: scoredProjectGroups,
    skills: scoredSkillGroups,
    emittedSelection: emitSelection ? resolve(process.cwd(), emitSelection) : null,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Detected: track=${track} | archetype=${archetype} | lang=${lang} | market=${market} | school=${schoolName}`);
    console.log(`Archetype hits:`, archDetect.scores);
    console.log('\nExperiences:');
    for (const e of scoredExperiences) {
      console.log(`  - [${e.recommended ? 'x' : ' '}] ${e.id} (score ${e.score}) -> items: ${e.recommendedItemIds.join(', ')}`);
    }
    console.log('\nProjects:');
    for (const g of scoredProjectGroups) {
      console.log(`  - ${g.title}: ${g.recommendedItemIds.join(', ') || '(none)'}`);
    }
    console.log('\nSkills:');
    for (const c of scoredSkillGroups) {
      if (c.recommendedSkills.length > 0) {
        console.log(`  - ${c.name}: ${c.recommendedSkills.join(', ')}`);
      }
    }
    if (result.warnings.length > 0) {
      console.log('\nGuardrail notices:');
      for (const w of result.warnings) console.log(`  ! ${w}`);
    }
    if (result.emittedSelection) {
      console.log(`\nSelection manifest written to: ${result.emittedSelection}`);
    }
  }
}

function stripInlineMarkers(text) {
  return String(text ?? '').replace(/\[\[(.*?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
}

function escapeTypstText(text) {
  return String(text ?? '').replace(/([#$@<>\\*`])/g, '\\$1');
}

function toTypstMarkup(text) {
  const parts = String(text ?? '').split('[[');
  return parts
    .map((part, idx) => {
      if (idx === 0) return escapeTypstText(part);
      const split = part.split(']]');
      if (split.length >= 2) {
        const inner = escapeTypstText(split[0]);
        const rest = escapeTypstText(split.slice(1).join(']]'));
        return `#highlight[${inner}]${rest}`;
      }
      return escapeTypstText('[[' + part);
    })
    .join('');
}

function renderAboutTyp(aboutData) {
  return [
    '#let cv-headline = [',
    `  ${toTypstMarkup(aboutData.headline)}`,
    ']',
    '',
    '#let about-me = [',
    `  ${toTypstMarkup(aboutData.about_me)}`,
    ']',
    '',
    '#let profile = [',
    `  ${toTypstMarkup(aboutData.profile)}`,
    ']',
    '',
  ].join('\n');
}

function runApply(args) {
  const manifestArg = args[0];
  let outDir = null;
  let syncDefault = false;
  let asJson = false;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--out-dir' && args[i + 1]) outDir = args[++i];
    else if (a === '--sync-default') syncDefault = true;
    else if (a === '--json') asJson = true;
  }

  if (!manifestArg || !outDir) {
    console.error('Usage: node scripts/typst/select-from-bank.mjs apply <selection.json> --out-dir <bundle-dir> [--sync-default] [--json]');
    process.exit(1);
  }

  const manifestPath = resolve(process.cwd(), manifestArg);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const targetDir = resolve(process.cwd(), outDir);
  mkdirSync(targetDir, { recursive: true });

  const expBank = loadYamlFile('content/yaml/experience-all.yml') || [];
  const projBank = loadYamlFile('content/yaml/projects-all.yml') || [];
  const skillBank = loadYamlFile('content/yaml/skills-all.yml') || [];
  const eduBank = (existsSync(join(ROOT, 'content/yaml/education-all.yml'))
    ? loadYamlFile('content/yaml/education-all.yml')
    : loadYamlFile('content/yaml/education.yml')) || [];

  const expById = new Map(expBank.map((e, idx) => [e.id, { ...e, _order: idx }]));
  const projGroupById = new Map(projBank.map((g) => [g.id, g]));
  const skillCatById = new Map(skillBank.map((c) => [c.id, c]));

  const warnings = [];

  // Build experiences YAML (enforce bank order to prevent non-chronological drift)
  const selectedExpIndices = [];
  const outExperiences = [];
  const mdExperiences = [];

  for (const sel of manifest.experiences || []) {
    const src = expById.get(sel.id);
    if (!src) throw new Error(`Unknown experience id in selection: ${sel.id}`);
    if (src.status === 'planned' && !manifest.allow_planned) {
      throw new Error(`Experience "${sel.id}" has status=planned; refusing unless allow_planned=true.`);
    }
    if (selectedExpIndices.length > 0 && src._order < selectedExpIndices[selectedExpIndices.length - 1]) {
      warnings.push(`Experience "${sel.id}" was reordered relative to experience-all.yml chronological order.`);
    }
    selectedExpIndices.push(src._order);

    const itemById = new Map((src.items || []).map((it) => [it.id, it]));
    const outItems = [];
    for (const selItem of sel.items || []) {
      const itemId = typeof selItem === 'string' ? selItem : selItem.id;
      const srcItem = itemById.get(itemId);
      if (!srcItem) throw new Error(`Unknown item id "${itemId}" in experience "${sel.id}"`);
      if (srcItem.status === 'planned' && !manifest.allow_planned) {
        throw new Error(`Experience item "${itemId}" has status=planned; refusing unless allow_planned=true.`);
      }
      const entry = {
        icon: srcItem.icon,
        text: (typeof selItem === 'object' && selItem.text) ? selItem.text : srcItem.text,
      };
      if (srcItem.title) entry.title = srcItem.title;
      outItems.push(entry);
    }

    const description = sel.description || src.description;
    outExperiences.push({
      title: src.title,
      info: src.info,
      description,
      items: outItems,
    });
    mdExperiences.push({
      company: src.company || src.title,
      role: src.role || src.title,
      location: src.location || 'Paris, France',
      dates: src.dates || src.info,
      description,
      items: outItems,
    });
  }

  // Build projects YAML
  const outProjects = [];
  for (const selGroup of manifest.projects || []) {
    const srcGroup = projGroupById.get(selGroup.id);
    if (!srcGroup) throw new Error(`Unknown project group id: ${selGroup.id}`);
    const itemById = new Map((srcGroup.items || []).map((it) => [it.id, it]));
    const outItems = [];
    for (const selItem of selGroup.items || []) {
      const itemId = typeof selItem === 'string' ? selItem : selItem.id;
      const srcItem = itemById.get(itemId);
      if (!srcItem) throw new Error(`Unknown project id "${itemId}" in group "${selGroup.id}"`);
      if (srcItem.status === 'planned' && !manifest.allow_planned) {
        throw new Error(`Project "${itemId}" has status=planned; refusing unless allow_planned=true.`);
      }
      if (srcItem.status === 'planned') {
        warnings.push(`Included planned home-lab project "${srcItem.name}" (allow_planned=true). Ensure trajectory wording is kept.`);
      }
      outItems.push({
        name: srcItem.name,
        icon: srcItem.icon,
        description: ((typeof selItem === 'object' && selItem.description) ? selItem.description : srcItem.description).trim(),
      });
    }
    if (outItems.length > 0) {
      outProjects.push({
        title: selGroup.title || srcGroup.title,
        items: outItems,
      });
    }
  }

  // Build skills YAML
  const outSkills = [];
  for (const selCat of manifest.skills || []) {
    const srcCat = skillCatById.get(selCat.id);
    if (!srcCat) throw new Error(`Unknown skill category id: ${selCat.id}`);
    const validByName = new Map(
      (srcCat.skills || []).map((s) => (typeof s === 'string' ? [s, { name: s, status: 'done' }] : [s.name, s])),
    );
    const chosen = [];
    for (const skName of selCat.skills || []) {
      const srcSkill = validByName.get(skName);
      if (!srcSkill) {
        throw new Error(`Skill "${skName}" is not in skills-all.yml category "${selCat.id}" (no-fabrication guard).`);
      }
      if (srcSkill.status === 'planned' && !manifest.allow_planned) {
        throw new Error(`Skill "${skName}" has status=planned; refusing.`);
      }
      chosen.push(srcSkill.name);
    }
    if (chosen.length > 0) {
      outSkills.push({
        name: selCat.name || srcCat.name,
        icon: srcCat.icon,
        skills: chosen,
      });
    }
  }

  const info = loadInfo();
  const schoolFr = info.school?.france || '';
  const schoolIntl = info.school?.international || schoolFr;
  const degreeDefault = info.school?.degree_default || '';
  const degreeEmbedded = info.school?.degree_embedded || degreeDefault;
  const targetSchool =
    manifest.school_name ||
    (manifest.market === 'france' ? schoolFr : schoolIntl);

  const includeEmbeddedSpecialty =
    typeof manifest.include_embedded_specialty === 'boolean'
      ? manifest.include_embedded_specialty
      : ['embedded-sec', 'inference-infra'].includes(manifest.archetype);

  const schoolPatterns = [schoolFr, schoolIntl].filter(Boolean).map(escapeRegExp);
  const schoolMatchRe = schoolPatterns.length > 0 ? new RegExp(`^(${schoolPatterns.join('|')})`, 'i') : null;
  const schoolInlineRe = schoolPatterns.length > 0 ? new RegExp(schoolPatterns.join('|'), 'i') : null;

  const outEducation = eduBank.map((edu) => {
    if (schoolMatchRe && targetSchool && schoolMatchRe.test(String(edu.title || ''))) {
      const degree = (includeEmbeddedSpecialty ? degreeEmbedded : degreeDefault) || edu.degree;
      return { ...edu, title: targetSchool, degree };
    }
    return edu;
  });

  // Also keep association title consistent with targetSchool if included
  if (schoolInlineRe && targetSchool) {
    for (const exp of outExperiences) {
      if (schoolInlineRe.test(String(exp.title || ''))) {
        exp.title = exp.title.replace(schoolInlineRe, targetSchool);
      }
    }
  }

  // Write Typst-ready YAML files
  const dumpOpts = { lineWidth: -1, quotingType: '"', forceQuotes: false };
  writeFileSync(join(targetDir, 'experience.yml'), yaml.dump(outExperiences, dumpOpts), 'utf8');
  writeFileSync(join(targetDir, 'projects.yml'), yaml.dump(outProjects, dumpOpts), 'utf8');
  writeFileSync(join(targetDir, 'skills.yml'), yaml.dump(outSkills, dumpOpts), 'utf8');
  writeFileSync(join(targetDir, 'education.yml'), yaml.dump(outEducation, dumpOpts), 'utf8');

  const lang = manifest.lang || manifest.about?.lang || 'en';
  if (lang === 'fr') {
    warnings.push('lang=fr requested while experience-all/projects-all/skills-all/education are authored in English — translate experience/project text overrides or switch to lang=en to avoid mixed FR/EN output.');
  }
  const aboutData = {
    lang,
    headline: manifest.about?.headline || '',
    about_me: manifest.about?.about_me || '',
    profile: manifest.about?.profile || '',
    sections: manifest.about?.sections || SECTION_TITLES[lang] || SECTION_TITLES.en,
  };
  writeFileSync(join(targetDir, 'about.yml'), yaml.dump(aboutData, dumpOpts), 'utf8');

  // Generate cv-tailored.md for verify-cv-facts.mjs
  const md = [];
  md.push(`# CV -- ${info.full_name || 'Candidate Name'}`);
  md.push('');
  md.push('## Professional Summary');
  md.push('');
  md.push([stripInlineMarkers(aboutData.about_me), stripInlineMarkers(aboutData.profile)].filter(Boolean).join(' '));
  md.push('');
  md.push('## Work Experience');
  md.push('');
  for (const exp of mdExperiences) {
    md.push(`### ${exp.company} -- ${exp.location}`);
    md.push('');
    md.push(`**${exp.role}**`);
    md.push(exp.dates);
    md.push('');
    if (exp.description) {
      md.push(exp.description);
      md.push('');
    }
    for (const item of exp.items) {
      const prefix = item.title ? `**${item.title}:** ` : '';
      md.push(`- ${prefix}${item.text}`);
    }
    md.push('');
  }
  md.push('## Projects');
  md.push('');
  for (const grp of outProjects) {
    for (const p of grp.items) {
      md.push(`- **${p.name}** -- ${p.description}`);
    }
  }
  md.push('');
  md.push('## Education');
  md.push('');
  for (const edu of outEducation) {
    const deg = [edu.degree, edu.comment].filter(Boolean).join(' ');
    md.push(`- **${edu.title}**${deg ? ` -- ${deg}` : ''}`);
    for (const it of edu.items || []) md.push(`  - ${it.text}`);
  }
  md.push('');
  md.push('## Skills');
  md.push('');
  for (const cat of outSkills) {
    md.push(`- **${cat.name}:** ${cat.skills.join(', ')}`);
  }
  md.push('');
  writeFileSync(join(targetDir, 'cv-tailored.md'), md.join('\n'), 'utf8');

  if (syncDefault) {
    copyFileSync(join(targetDir, 'experience.yml'), join(ROOT, 'content/yaml/experience.yml'));
    copyFileSync(join(targetDir, 'projects.yml'), join(ROOT, 'content/yaml/projects.yml'));
    copyFileSync(join(targetDir, 'skills.yml'), join(ROOT, 'content/yaml/skills.yml'));
    copyFileSync(join(targetDir, 'education.yml'), join(ROOT, 'content/yaml/education.yml'));
    writeFileSync(join(ROOT, 'content/typ/about.typ'), renderAboutTyp(aboutData), 'utf8');
  }

  const summary = {
    bundleDir: targetDir,
    archetype: manifest.archetype || null,
    track: manifest.track || null,
    lang,
    syncedDefault: syncDefault,
    counts: {
      experiences: outExperiences.length,
      experienceItems: outExperiences.reduce((n, e) => n + e.items.length, 0),
      projects: outProjects.reduce((n, g) => n + g.items.length, 0),
      skillCategories: outSkills.length,
      skills: outSkills.reduce((n, c) => n + c.skills.length, 0),
    },
    files: ['experience.yml', 'projects.yml', 'skills.yml', 'education.yml', 'about.yml', 'cv-tailored.md'].map((f) => join(targetDir, f)),
    warnings,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Bundle generated at ${targetDir}`);
    console.log(`Counts: ${summary.counts.experiences} experiences (${summary.counts.experienceItems} bullets), ${summary.counts.projects} projects, ${summary.counts.skills} skills across ${summary.counts.skillCategories} categories`);
    if (syncDefault) console.log('Also synced experience.yml, projects.yml, skills.yml, and content/typ/about.typ');
    for (const w of warnings) console.log(`! ${w}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'score') {
  runScore(rest);
} else if (cmd === 'apply') {
  runApply(rest);
} else {
  console.log('Usage:\n  node scripts/typst/select-from-bank.mjs score <jd-file> [options]\n  node scripts/typst/select-from-bank.mjs apply <selection.json> --out-dir <bundle-dir> [--sync-default]');
  process.exit(cmd ? 1 : 0);
}
