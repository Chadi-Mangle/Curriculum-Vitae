---
name: typst-cv
description: "Tailor and compile a 1-page Typst CV (`main.typ`) for a specific job offer by selecting the most relevant experiences, projects, skills, and profile summary from `content/yaml/*-all.yml` across archetypes (`platform-sre`, `inference-infra`, `embedded-sec`, `network-5g6g`, `sched-agentic`) and tracks (`cifre-phd`, `cdi-fr`, `vie`), running humanizer, career-ops fact-check, and ATS keyword gates."
user-invocable: true
---

# typst-cv — Tailored Typst CV Pipeline (`*-all.yml` × `career-ops` × `humanizer`)

Use this skill whenever generating or tailoring a CV for a job offer (standalone or when invoked by `career-ops` `auto-pipeline` / `pipeline` / `pdf` via `modes/_custom.md`).

## Non-Negotiable Ground Truth & Honesty Rules

1. **Master bank is the single source of truth:** `content/yaml/info.yml`, `content/yaml/experience-all.yml`, `content/yaml/projects-all.yml`, `content/yaml/skills-all.yml`, `content/yaml/about-all.yml`, `content/yaml/education-all.yml`.
2. **Read candidate-specific rules from User Layer:** Always check `modes/_profile.md`, `modes/_custom.md`, and `config/profile.yml` for candidate availability, school-naming overrides, track priorities, narrative bridges, and watchlist exclusions.
3. **Never fabricate or overclaim:**
   - NEVER present `status: planned` items or research axes as completed production experience.
   - NEVER add research watchlist terms (listed in `modes/_profile.md`) to CV skills.
   - Surface items marked `confirm_before_cv: true` or `status: in-progress` to the user so framing stays truthful.
   - When in doubt about any proof point, ask the user instead of extrapolating.

## Step-by-Step Pipeline

### Step 0 — First-Time YAML Generation (If Any Personal YAML Is Missing)
If `content/yaml/info.yml` or any `content/yaml/*-all.yml` file does not exist yet, **always read and model the new file directly on its `*.example.yml` counterpart** (`content/yaml/info.example.yml`, `content/yaml/{experience,projects,skills,about,education}-all.example.yml`, plus `config/profile.example.yml` and `portals*.example.yml`). Preserve the exact YAML schema, required keys, Font Awesome icon names, and metadata fields (`id`, `archetypes`, `tracks`, `tags`, `priority`, `status`, `confirm_before_cv`), fill in only verified candidate facts, and run `make sync && make doctor` before proceeding.

### Step 1 — Sync `cv.md` from `*-all.yml` & `info.yml`
Ensure `cv.md` reflects the latest master YAML bank:
```bash
make sync
```

### Step 2 — Archive JD & Run Skill-Gap Analysis
Write the JD verbatim to `jds/{slug}.md` (if not already archived), then classify JD requirements against `cv.md`:
```bash
node jd-skill-gap.mjs jds/{slug}.md --summary
```
Explicitly report any `gap` skills to the user — never fabricate or silently paper over gaps.

### Step 3 — Score the Master Bank (`*-all.yml`) Against the JD
Run deterministic scoring to rank experiences, bullets, projects, and skills and emit an initial manifest:
```bash
node scripts/typst/select-from-bank.mjs score jds/{slug}.md \
  [--track cifre-phd|cdi-fr|vie] \
  [--archetype platform-sre|inference-infra|embedded-sec|network-5g6g|sched-agentic] \
  [--lang en|fr] \
  --emit-selection output/bundles/{slug}/selection.json
```
Review `output/bundles/{slug}/selection.json`:
- Verify track, archetype, language, and market (`france` vs `international`):
  - **All PhD / CIFRE CVs (`track: cifre-phd`) MUST be 100% in English (`lang: en`)** — never mix French headers/summary with English YAML bullets.
  - **School naming & conditional specialty rule:** `select-from-bank.mjs` reads `content/yaml/info.yml → school` (`france` vs `international`, `degree_default` vs `degree_embedded`). Include the embedded specialty suffix ONLY when the target role is NOT Cloud or Networking (`embedded-sec`, `inference-infra`, compilation/hardware offers).
  - **Availability:** Check `content/yaml/info.yml → availability` / `config/profile.yml → candidate.availability`.
- Keep `experiences` in reverse-chronological order (never reorder dates/employers; only filter/order bullets inside each role).
- Adapt `about.headline`, `about.about_me`, and `about.profile` honestly to the JD using `[[highlight]]` markers where helpful, while preserving every status/honesty rule above.
- **Humanizer pass (mandatory):** Apply `.agent/skills/humanizer/SKILL.md` (embedded mode) to any rewritten prose in `about` or experience/project overrides so the text reads naturally with zero AI tells (no not-X-but-Y contrasts, forced triads, inflated verbs, or unnecessary dashes) and zero factual drift.
- Keep `allow_planned: false` unless the user explicitly asks to include a planned trajectory project with its exact authorized wording.
- Check guardrail notices for `confirm_confidentiality` / `confirm_before_cv` items.

### Step 4 — Materialize the Typst Bundle & Sync Active Preview Files
Run `apply` with `--sync-default` so both the archived per-offer bundle in `output/bundles/{slug}/` and the gitignored active preview files (`content/yaml/{experience,projects,skills,education}.yml` + `content/typ/about.typ`) stay up to date:
```bash
node scripts/typst/select-from-bank.mjs apply output/bundles/{slug}/selection.json \
  --out-dir output/bundles/{slug} \
  --sync-default
```

### Step 5 — Fact-Gate, Compile Typst PDF, Strict 1-Page Verification & ATS Keyword Check
```bash
make build \
  BUNDLE=output/bundles/{slug} \
  OUT=output/{NNN}-cv-{candidate-slug}-{company}-{YYYY-MM-DD}.pdf \
  JD=jds/{slug}.md \
  REPORT={NNN} \
  REPORT_FILE=reports/{NNN}-{company}-{YYYY-MM-DD}.md
```
- **Hard 1-page gate (mandatory):** `build-typst-cv.mjs` enforces `--max-pages 1` strictly (exits 3 and writes a `.overflow.pdf` draft if pages > 1). If the CV exceeds 1 page, NEVER deliver it: trim lower-priority bullets, projects, or skills in `selection.json`, re-run Step 4 (`--sync-default`) and Step 5 until the PDF compiles to **exactly 1 page**.
- **Verify `main.typ` directly:** run `make cv` to confirm `main.typ` also renders on **1 page**.
- **If `verify-cv-facts.mjs` blocks (exit 2):** fix the unsupported claim in `selection.json`, re-run Step 4 and Step 5. Never pass `--skip-fact-check` unless explicitly requested by the user.

### Step 6 — Report Summary
Report concisely to the user:
- Selected `track`, `archetype`, and `lang`
- Final PDF path & page count (1 page)
- `verify-cv-facts.mjs` verdict
- Real PDF ATS keyword coverage % (`keyword-match.mjs` on `pdftotext` output)
- Any `gap`, `planned`, `in-progress`, or unconfirmed items to keep in mind.
