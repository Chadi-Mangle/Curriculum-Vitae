# Custom Instructions Template — copy to modes/_custom.md and adapt to your workflow.

## House Rules

- **Source of truth for CV content:** `content/yaml/info.yml` and the master YAML bank in `content/yaml/*-all.yml` (`experience-all.yml`, `projects-all.yml`, `skills-all.yml`, `about-all.yml`, `education-all.yml`) are the canonical source of truth. Run `make sync` whenever `info.yml` or any `*-all.yml` file changes.
- **First-time YAML bootstrap (always follow `*.example.yml`):** When generating any missing personal YAML file (`content/yaml/info.yml`, `content/yaml/*-all.yml`, `config/profile.yml`, `portals.yml`, `portals.cdi-vie.yml`), always inspect and base it directly on its matching `*.example.yml` template to preserve exact keys, schema, icons, and metadata tags.
- **CV generation uses Typst (`typst-cv` skill):** Follow `.agent/skills/typst-cv/SKILL.md` (`select-from-bank.mjs` + `build-typst-cv.mjs` + `main.typ` with `--font-path font`) and strictly enforce 1 page (`--max-pages 1`).
- **Mandatory Humanizer pass (`.agent/skills/humanizer/SKILL.md`):** Apply `blader/humanizer` (embedded mode) to every generated or rewritten prose block (`about.yml`, edited bullets, `cover-letter.yml`, outreach emails, and form answers) to remove AI writing tells while preserving 100% of verified facts. Always run `verify-cv-facts.mjs` after rewriting.
- **Cover letters use Typst (`cover-letter.typ`):** Compile via `make cover`, strictly 1 page, flowing prose paragraphs only (no bullets, icons, or inline bold/colored text in the body).
- **Strict honesty:** Never fabricate metrics, tools, or completed experience from `planned` / `research-axis` items. Never list research watchlist technologies as mastered skills.
- **Off-limits:** Never auto-submit an application or send an email automatically.

## Output Preferences

- Save per-offer Typst bundles under `output/bundles/{slug}/` and prefix deliverables with the 3-digit offer ID (`{NNN}`):
  - `output/{NNN}-cv-{candidate-slug}-{company}-{YYYY-MM-DD}.pdf`
  - `output/{NNN}-cover-letter-{candidate-slug}-{company}-{YYYY-MM-DD}.pdf`
  - `output/{NNN}-dossier-{candidate-slug}-{company}-{YYYY-MM-DD}.pdf` (via `make merge-dossiers`)
  - `output/{NNN}-apply-{company}-{offer-id}.md`
