# documents/ — Static Personal PDF Attachments

Place static personal PDFs here (all `.pdf` files are gitignored). They are automatically merged by `make merge-dossiers` (`scripts/typst/merge-dossier.mjs`) into each application dossier PDF in canonical order:

- `notes.pdf` — Academic transcripts (required for PhD / ADUM dossiers)
- `recommandation.pdf` or `recommendation.pdf` — Reference letter(s) (optional, auto-detected whenever present)
