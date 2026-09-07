# Phase Routing Playbook

Use this playbook to route incoming SEO/GEO user requests to the appropriate phase and specialized sub-skill.

| Request Pattern / User Prompt | Target Phase | Primary Sub-Skill | Output Deliverable |
|---|---|---|---|
| "Find keywords for [topic]", "What are people searching for regarding X?" | `survey` | `keyword-research` | Prioritized keyword map with volume, difficulty, intent & cluster groupings |
| "Analyze competitor X", "Compare our SEO with competitor.com" | `survey` | `competitor-analysis` | Competitor battlecard, content footprint, and ranking overlap |
| "What appears on Google for [query]?", "Who owns the snippet for X?" | `survey` | `serp-analysis` | SERP breakdown, PAA questions, featured snippet opportunity |
| "What topics are we missing vs competitors?" | `survey` | `content-gap-analysis` | Content gap matrix with high-opportunity missing clusters |
| "Write an SEO article on X", "Create a landing page for Y" | `implement` | `content-writer` | SEO-optimized article/page with H1-H3 hierarchy and direct answers |
| "Make this article citable by ChatGPT/Perplexity", "Optimize for AI Overviews" | `implement` | `geo-content-optimizer` | GEO-enhanced copy with entity definition blocks, tables, and quotable stats |
| "Generate meta tags and Schema markup for this page" | `implement` | `serp-markup-builder` | High-CTR Title, Meta Description, OG tags, and valid JSON-LD schema |
| "Build programmatic pages", "Create a comparison page (X vs Y)" | `implement` | `page-play-builder` | Template architecture, dataset schema, and page design blueprint |
| "Audit this article for quality", "Check EEAT for this post" | `tune` | `content-quality-auditor` | 80-item CORE-EEAT scorecard + SHIP/FIX/BLOCK verdict |
| "Check site speed, Core Web Vitals, and robots.txt" | `tune` | `technical-seo-checker` | Technical audit report, CWV status, crawlability review |
| "Review on-page SEO for this URL/file" | `tune` | `on-page-seo-checker` | Heading structure, keyword density, alt text, and link health |
| "Improve our internal linking and topic clusters" | `tune` | `site-structure-optimizer` | Hub-and-spoke internal linking architecture and Mermaid diagram |
| "How trustworthy is our domain?", "Audit domain authority" | `evaluate` | `domain-authority-auditor` | 40-item CITE trust evaluation + TRUSTED/CAUTIOUS/UNTRUSTED verdict |
| "Check keyword ranking changes", "Why did ranking drop?" | `evaluate` | `rank-tracker` | Ranking trajectory report, position shifts, drop root-cause |
| "Generate monthly SEO performance report", "Set traffic alert" | `evaluate` | `performance-monitor` | Multi-metric KPI dashboard, conversion report, alert thresholds |
| "Audit our backlinks", "Track AI assistant referral traffic" | `evaluate` | `offsite-signal-analyzer` | Backlink quality distribution, toxic link review, AI referral logs |
