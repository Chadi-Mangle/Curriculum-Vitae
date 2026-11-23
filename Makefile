# Curriculum-Vitae × career-ops workflow shortcuts

TYPST ?= typst
NODE ?= node

.PHONY: scan-phd scan-cdi sync score build cover cv merge-dossiers doctor

## Scan Thèses & Thèses CIFRE ONLY (portals.yml)
scan-phd:
	$(NODE) scan.mjs

## Scan CDI France & VIE ONLY (portals.cdi-vie.yml)
scan-cdi:
	CAREER_OPS_PORTALS=portals.cdi-vie.yml $(NODE) scan.mjs

## Regenerate cv.md from content/yaml/*-all.yml
sync:
	$(NODE) scripts/typst/sync-cv-md.mjs

## Score master YAML bank against a JD: make score JD=jds/example.md [ARCH=sched-agentic] [TRACK=cifre-phd] [CV_LANG=en] [OUT=output/bundles/slug/selection.json]
score:
	@test -n "$(JD)" || (echo "Usage: make score JD=path/to/jd.md [ARCH=...] [TRACK=...] [CV_LANG=en|fr] [OUT=...]" && exit 1)
	$(NODE) scripts/typst/select-from-bank.mjs score "$(JD)" \
		$(if $(ARCH),--archetype "$(ARCH)") \
		$(if $(TRACK),--track "$(TRACK)") \
		$(if $(CV_LANG),--lang "$(CV_LANG)") \
		$(if $(OUT),--emit-selection "$(OUT)")

## Build & fact-check a tailored 1-page Typst CV PDF: make build BUNDLE=output/bundles/slug OUT=output/NNN-cv-....pdf [JD=jds/slug.md] [REPORT=NNN] [REPORT_FILE=reports/...]
build:
	@test -n "$(BUNDLE)" && test -n "$(OUT)" || (echo "Usage: make build BUNDLE=output/bundles/... OUT=output/NNN-cv-....pdf [JD=jds/...] [REPORT=NNN] [REPORT_FILE=reports/...]" && exit 1)
	$(NODE) scripts/typst/build-typst-cv.mjs --bundle "$(BUNDLE)" --out "$(OUT)" --max-pages 1 \
		$(if $(JD),--jd "$(JD)") \
		$(if $(REPORT),--report "$(REPORT)") \
		$(if $(REPORT_FILE),--report-file "$(REPORT_FILE)")

## Compile a tailored 1-page Typst cover letter: make cover LETTER=output/bundles/slug/cover-letter.yml OUT=output/NNN-cover-letter-....pdf
cover:
	@test -n "$(LETTER)" && test -n "$(OUT)" || (echo "Usage: make cover LETTER=output/bundles/.../cover-letter.yml OUT=output/NNN-cover-letter-....pdf" && exit 1)
	$(TYPST) compile cover-letter.typ "$(OUT)" --font-path font --input "letter-file=$(LETTER)"
	@pages=$$(pdfinfo "$(OUT)" 2>/dev/null | awk '/^Pages:/ {print $$2}'); \
	[ -n "$$pages" ] || pages=$$(pdftotext "$(OUT)" - | tr -cd '\f' | wc -c); \
	if [ "$$pages" -gt 1 ]; then \
		echo "ERROR: $(OUT) has $$pages pages (expected 1 page)"; exit 1; \
	else \
		echo "OK: $(OUT) fits on $$pages page"; \
	fi

## Compile default CV (content/yaml/*.yml + content/typ/about.typ) and verify 1-page limit
cv:
	$(TYPST) compile main.typ cv.pdf --font-path font
	@pages=$$(pdfinfo cv.pdf 2>/dev/null | awk '/^Pages:/ {print $$2}'); \
	[ -n "$$pages" ] || pages=$$(pdftotext cv.pdf - | tr -cd '\f' | wc -c); \
	if [ "$$pages" -gt 1 ]; then \
		echo "ERROR: cv.pdf has $$pages pages (expected 1 page)"; exit 1; \
	else \
		echo "OK: cv.pdf fits on $$pages page"; \
	fi

## Merge CV + Cover Letter + documents/notes.pdf + optional documents/recommandation*.pdf into single ADUM-ready dossier PDFs
merge-dossiers:
	$(NODE) scripts/typst/merge-dossier.mjs --all

## Check career-ops setup, profile, and both portal configs
doctor:
	$(NODE) doctor.mjs
	$(NODE) validate-profile.mjs
	$(NODE) validate-portals.mjs
	$(NODE) validate-portals.mjs --file portals.cdi-vie.yml
