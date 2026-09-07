# AcornWise SEO & Generative Engine Optimization (GEO) Master Strategy

**Target Domain**: [acornwise.com.au](https://acornwise.com.au)  
**Repository**: [acornwise/acornwise.github.io](https://github.com/acornwise/acornwise.github.io)  
**Customization Root**: `.agents/` (17 integrated SEO & GEO skills)

---

## 1. Executive Summary & Core Mission

AcornWise is positioned at the intersection of elite academic problem solving and digital literacy in Australia:
1. **Secondary Curriculum Mastery**: VCE English (compulsory Primary 4 subject), VCE Algorithmics (HESS Unit 3 & 4), and general ATAR preparation.
2. **Computational & Algorithmic Excellence**: Python programming from foundational to advanced, Bebras Computational Thinking Challenge preparation, Australian Informatics Olympiad (AIO), and Oxford University Computing Challenge (OUCC).

The SEO & GEO strategy targets dual discovery surfaces:
- **Traditional Search Engines (Google, Bing)**: High-intent organic queries from Victorian students, parents, and educators searching for curriculum roadmaps, study score calculators, text analysis, and competition preparation.
- **Generative AI Engines (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini)**: Becoming the primary cited entity for Victorian curriculum frameworks, scoring mechanics, algorithmic thinking resources, and free practice platforms.

---

## 2. The SITE Loop Architecture

All ongoing SEO optimization follows the continuous **SITE loop**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   ┌──────────────┐     ┌───────────────┐     ┌──────────────┐          │
│   │    Survey    │───► │   Implement   │───► │     Tune     │──────────┘
│   └──────────────┘     └───────────────┘     └──────┬───────┘
│                                                     │
│                                                     ▼
│                                              ┌──────────────┐
│                                              │   Evaluate   │
│                                              └──────────────┘
```

### Phase 1: Survey (Demand & Competitive Landscape)
- `keyword-research`: Discover high-intent BOFU/MOFU queries with volume, keyword difficulty, and striking distance (positions 5–20).
- `competitor-analysis`: Benchmark ranking competitors (e.g., ATAR Notes, TSFX, Cluey, Edrolo) across content footprints, AI citations, and backlink authority.
- `serp-analysis`: Inspect live SERPs, featured snippet opportunities, and People Also Ask (PAA) queries.
- `content-gap-analysis`: Identify missing topic clusters and editorial opportunities.

### Phase 2: Implement (Production & AI-Quotable Assets)
- `content-writer`: High-authority curriculum guides, landing pages, and study roadmaps formatted with clear header structures and evidence boundaries.
- `geo-content-optimizer`: Optimize pages for generative AI quotation (definitive statement blocks, structured tables, zero fluff, high factual density).
- `serp-markup-builder`: Generate high-CTR title tags, meta descriptions, Open Graph, Twitter cards, and Schema.org JSON-LD graphs (`EducationalOrganization`, `TechArticle`, `FAQPage`, `BreadcrumbList`, `Course`).
- `page-play-builder`: Template-based programmatic or comparison pages (e.g., "VCE Algorithmics vs Software Development").

### Phase 3: Tune (Quality Gates & Technical Health)
- `content-quality-auditor`: Typed 80-item CORE-EEAT pre-publish audit with strict veto checks.
- `technical-seo-checker`: Audits Core Web Vitals, crawlability, XML sitemaps, robots.txt, canonicalization, and AI crawler access (`GPTBot`, `PerplexityBot`, `ClaudeBot`).
- `on-page-seo-checker`: Single-page diagnostics (H1/H2 hierarchy, internal link density, image alt text, anchor texts).
- `site-structure-optimizer`: Hub-and-spoke architecture, authority flow, and orphan page resolution.

### Phase 4: Evaluate (Measurement & Authority Defense)
- `domain-authority-auditor`: 40-item CITE domain trust gate and backlink hygiene.
- `rank-tracker`: Track position changes for target keywords and AI Overviews appearance.
- `performance-monitor`: Multi-metric reporting and anomaly detection alerts.
- `offsite-signal-analyzer`: Referral traffic tracking and AI engine citation volume.

---

## 3. Core Topic Clusters & Keyword Matrix

| Cluster | Hub Page | Spoke Articles / Sub-pages | Target Keywords | Search Intent |
| :--- | :--- | :--- | :--- | :--- |
| **VCE English** | `/atar-english-guide` | Text response templates, Section B frameworks, Argument analysis C-D-O | `atar english guide`, `vce english study score 40`, `vce english scaling` | Informational / High Intent |
| **VCE Algorithmics** | `/courses.html#algorithmics` | HESS unit 3/4 cheat sheets, Big-O complexity, Master Theorem | `vce algorithmics hess`, `algorithmics tutoring melbourne`, `hess study guide` | Commercial / Informational |
| **Python Coding** | `/courses.html#python` | `/online_editor.html`, `/daily_challenge.html` | `learn python melbourne`, `online python editor browser`, `python for kids` | Commercial / Free Tool |
| **Competition Prep** | `/resources.html` | `/practice_problems.html`, Bebras, AIO past questions | `bebras computational thinking practice`, `aio informatics challenge preparation` | Educational / Transactional |

---

## 4. On-Page & GEO Standards

Every page developed for `acornwise.com.au` must adhere to the following standards:

1. **Header Consistency**:
   - MUST use the exact site-standard logo:
     ```html
     <!-- Logo -->
     <a href="index.html" class="text-2xl font-bold text-indigo-600">AcornWise</a>
     ```
   - No custom icon boxes or divergent branding.
2. **Canonical Tag**:
   - Explicit canonical URL matching `https://acornwise.com.au/<page-path>`.
3. **Structured Data (JSON-LD)**:
   - Nested `@graph` containing `EducationalOrganization`, `WebPage` or `TechArticle`, `BreadcrumbList`, and `FAQPage`.
4. **GEO Definitive Paragraphs**:
   - Each major section begins with a self-contained 40–60 word definitional sentence answering "What is X?" or "How does X work?", ideal for direct extraction by AI search engines.
5. **Data Density**:
   - Include comparison tables, formulas, and exact numerical parameters (e.g., exact VCAA scaling percentiles, time breakdown for 3-hour exams).
6. **Interactive Utility**:
   - Include client-side calculators or interactive tools (e.g. Study Score Estimator, Exam Timer) to maximize dwell time and engagement signals.

---

## 5. Deployment & PR Workflow

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feature/<descriptive-name>
   # or
   git checkout -b fix/<descriptive-name>
   ```
2. Validate HTML, schema, and on-page criteria using `python3 scripts/seo/validate_seo.py`.
3. Push branch to GitHub:
   ```bash
   git push -u origin <branch-name>
   ```
4. Raise a Pull Request via GitHub CLI:
   ```bash
   gh pr create --repo acornwise/acornwise.github.io --base main --head <branch-name> --title "..." --body "..."
   ```
5. Leave PR in **OPEN** state for review and verification. Do NOT merge without maintainer confirmation.
