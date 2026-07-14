---
name: write-docs
description: >-
  Use this skill whenever the user asks you to write, draft, or produce
  documentation of ANY kind for this project — a guide, how-to, spec, feature
  write-up, onboarding doc, technical note, changelog, or report. It is
  triggered by requests like "viết tài liệu", "tạo doc", "write documentation",
  "làm hướng dẫn", "soạn tài liệu". The deliverable is ALWAYS a self-contained
  HTML file, and the document content is ALWAYS written in Vietnamese with full
  diacritics. Do NOT use this skill for source-code comments or for editing
  existing Markdown files unless the user explicitly wants an HTML document.
---

# Write Docs

Produce project documentation as a **standalone, styled HTML file** whose content
is written in **Vietnamese with full diacritics**. The document type is flexible
(guide, spec, report, onboarding, notes, etc.) — adapt the structure to the topic.

## Hard requirements (do not skip)

1. **Output = one HTML file.** Never deliver the documentation only as chat text or
   Markdown. Always create/overwrite an `.html` file with the Write tool.
2. **Content language = Vietnamese with correct diacritics.** Write natural,
   professional Vietnamese with all tone marks intact (e.g. "tài liệu", "hướng dẫn",
   "cập nhật") — never strip accents, never use ASCII-only Vietnamese. Keep
   `<html lang="vi">` and `<meta charset="UTF-8">`.
   - Keep code, identifiers, commands, file paths, and env-var names in their
     original form (do not translate `npm run build`, `firestore.rules`, etc.).
3. **Self-contained.** Inline all CSS. No local build step and no external JS. The
   only allowed external requests are the Google Fonts links already in the template.
4. **On-brand.** Base the file on `.claude/skills/write-docs/template.html` (this
   folder) so it matches the project's glassmorphism dark theme. Reuse its CSS
   variables, fonts (Outfit / Inter / JetBrains Mono), cards, callouts, and tables.

## Steps

1. **Clarify the target** only if it is genuinely unclear: what the doc is about,
   who reads it, and the output path. Otherwise pick sensible defaults and proceed.
2. **Read the template** at `.claude/skills/write-docs/template.html` and use it as
   the starting structure. Do not reinvent the styling.
3. **Pull real facts from the repo.** Ground the content in actual files —
   `README.md`, `DATA_MODEL.md`, `CLAUDE.md`, `design_system_guide.md`, code in
   `web/` and `bot/`. Do not invent APIs, fields, or commands; verify before writing.
4. **Write the HTML file.** Default location: `docs/<kebab-slug>.html` at the repo
   root (create the `docs/` folder if needed). Use the slug from the title, e.g.
   `docs/huong-dan-cai-dat.html`. If the user names a path, use it.
   - Fill in `<title>`, the `.doc-header` (title, date, author), and rebuild the
     table-of-contents `<nav class="toc">` so it has exactly one link per `<h2>`,
     with matching `id` anchors (use unaccented kebab ids like `id="cai-dat"` so the
     `href="#..."` links work).
   - Use the template's components where they fit: `.card`, `.callout` (info /
     success / warning / danger), `.table-wrap` + `<table>`, `<pre><code>` blocks,
     `.badge`.
5. **Set the date** to today's real date (check the environment's current date; do
   not guess) and a reasonable author (ask or use the project owner).
6. **Report back** with the file path and a one-line summary. Offer to open/preview
   it (it can be opened directly in a browser, or published as an Artifact if the
   user wants a shareable link).

## Quality checklist before finishing

- [ ] File is valid HTML, opens standalone in a browser, renders with the dark theme.
- [ ] All body copy is Vietnamese **with diacritics**; nothing important left in English.
- [ ] Table of contents links match every `<h2>` id and jump correctly.
- [ ] Every technical claim (command, field, path) was verified against the repo.
- [ ] No external scripts; only the Google Fonts `<link>`s remain.

## Notes

- For longer docs, add more `<h2>` sections and keep the TOC in sync.
- For a report with data (e.g. sprint/task stats), fetch the numbers first, then
  render them into the template's tables/cards — do not fabricate figures.
- If the user wants a shareable hosted link rather than a local file, you may also
  publish the finished HTML via the Artifact tool after writing it.
