# Writing Software Documentation: A Practical Guide

## Start with your audience, not your template

Before writing anything, answer two questions: what do you want to convey, and who is it for?

- **Developers using your project** (API consumers, library users) need quick starts, examples, and reference material.
- **Contributors maintaining the codebase** need architecture context, setup instructions, and decision rationale.
- **Non-technical stakeholders** need progress, plans, and impact — not implementation detail.

These are different documents with different vocabularies. Trying to serve all three audiences in one page is usually why documentation feels unhelpful even when it's technically complete.

## Organize by what the reader is trying to do

A useful way to structure a documentation set is by the reader's *intent*, not by topic:

| Type | Purpose | Reader's mindset |
|---|---|---|
| **Tutorial** | Learning-oriented, builds understanding step by step | "Teach me" |
| **How-to guide** | Goal-oriented, walks through a specific task | "I know what I want, show me how" |
| **Reference** | Structured, exhaustive, technical | "I need the exact detail" |
| **Explanation** | Background and reasoning | "Help me understand why" |

Mixing these within a single page is a common source of confusion — a reader trying to accomplish a task doesn't want a history lesson first, and a reader trying to learn a concept doesn't want a bare parameter list.

Within any individual page, lead with the most important information first, then supporting detail, then background — the "inverted pyramid" approach borrowed from journalism.

## The core artifacts every project needs

### README
The first thing anyone sees. Keep it focused:
- What the project does and why it exists
- A minimal working example
- Install/setup instructions (a couple of lines for the basic case; link out for edge cases)
- Link to fuller docs, contributing guide, and license

### Changelog
A running, version-ordered record of what changed. This is what lets users and contributors trust that they're looking at current information without reading every commit.

### Architecture / design docs
Explain *why* the system is built the way it is, not just what it does. Writing these down forces you to formally think through decisions — and gives future contributors the context to make changes consistent with original intent, instead of guessing.

### API reference
Structured and consistent above all. Prose and runnable code examples side by side (with pre-filled sample values, not placeholders) make reference docs dramatically more usable — this is why API docs from companies like Stripe are frequently cited as the benchmark.

### Contributing guide
Contributors have their own expectations of how to get involved. Documenting your process — branching, review, testing, style — means contributions arrive in a shape you can actually merge, and gives people a lower-stakes way to contribute before they touch code.

## Keep docs from rotting

This is where most documentation efforts actually fail — not in the initial writing, but in the months after.

- **Ship docs and code together.** Treat doc updates as part of the same pull request as the code change they describe, reviewed in the same pass.
- **Assign ownership.** Pages without an owner don't get updated.
- **Use freshness signals.** Automated flags for "not updated in N days" surface stale pages before a user finds them broken.
- **Tie docs to "done."** A feature isn't finished until its documentation is. This single rule prevents most drift.

## Style and consistency

- Pick one convention for referring to UI elements (e.g., **bold** for clickable things, *italics* for input fields, "quotes" for window/tab names) and apply it everywhere. Inconsistent formatting makes readers think you mean something different when you don't.
- Use ordered lists for sequential steps, unordered lists for everything else.
- Include a real example for anything a user has to fill in or configure — sample values, not just field names.
- Write alt text for images and diagrams, and check color contrast — documentation is a product surface, and accessibility is part of usability.

## A trap worth avoiding

FAQs feel like an easy way to start documenting, but they age badly: they accumulate unrelated content, become hard to search as they grow, and are rarely built from actual user questions. They're fine as a stopgap for a brand-new project, but treat them as temporary — a placeholder for real documentation, not a substitute for it.

## Tooling notes

- **Mermaid** is a common default for diagrams because it's text-based and lives in version control right alongside your docs and code — no separate diagramming tool to keep in sync.
- **Docs-as-code** setups (docs written in Markdown, reviewed via pull request, deployed from CI) keep documentation and code changes moving at the same pace, which is the main practical defense against drift.

---

*Treat this document itself as an example of the advice above: it's organized by reader intent, leads with what matters most, and is meant to be updated as your own practices evolve — not written once and left alone.*