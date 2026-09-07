---
description: "Guidelines and quality benchmarks for SEO marketing, Generative Engine Optimization (GEO), on-page markup, and content publishing."
---

# SEO and Generative Engine Optimization (GEO) Rules

When writing web pages, blog posts, landing pages, metadata, or structured data for this project or any marketing deliverable, follow these principles:

## 1. Information Architecture & On-Page SEO
- **Heading Hierarchy**: Every page must have exactly one `<h1>`. Subsections must follow a logical hierarchy (`<h2>`, then `<h3>`, never skip levels).
- **Direct Answer First**: Every informational section must begin with a 1–2 sentence direct answer before expanding into detailed explanation (optimized for Google Featured Snippets and AI engine citation extraction).
- **Semantic HTML**: Use semantic HTML elements (`<main>`, `<article>`, `<section>`, `<nav>`, `<aside>`) instead of nested `<div>` soup.
- **Images**: Always specify descriptive, non-empty `alt` text and explicit `width`/`height` or aspect ratios to prevent Cumulative Layout Shift (CLS).

## 2. Generative Engine Optimization (GEO)
- **Entity Definitions**: State the core subject as a clear declarative entity definition: `"[Subject] is a [category] that [key differentiator and function]."`
- **Structured Data Tables**: Use comparison and feature tables where applicable — AI engines (ChatGPT, Perplexity) prioritize tabular data for comparative queries.
- **Factual Citation Density**: Include concrete numbers, dates, version numbers, or verified specifications. Avoid vague claims like "very fast" or "best-in-class" without data.

## 3. Metadata & Structured Data
- **Title Tags**: 50–60 characters. Place primary target keyword near the front, followed by secondary keyword or brand name (e.g. `VCE English Exam Guide: Essay Structures & Vocabulary | LexiQuest`).
- **Meta Descriptions**: 130–155 characters. Include search intent hook and an actionable call-to-action (CTA).
- **JSON-LD Schema**: Provide valid Schema.org markup formatted as `<script type="application/ld+json">`. Use appropriate types (`Article`, `Course`, `FAQPage`, `BreadcrumbList`, `SoftwareApplication`, `Organization`). Never invent fake ratings, reviews, or unverified authors.

## 4. Quality Gates & Veto Checks
- Adhere to the **CORE-EEAT** content benchmark:
  - `T04` (VETO): Never fabricate facts, statistics, citations, or quotes.
  - `C01` (VETO): Never include deceptive claims or misleading pricing/features.
  - `R10` (VETO): Never engage in keyword stuffing or unnatural keyword repetition.
- If any veto condition is met, content cannot be marked as publish-ready (`SHIP`). It must be flagged for `FIX` or `BLOCK`.
