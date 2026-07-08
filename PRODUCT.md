# Product

## Register

product

## Users

Academic researchers (grad students, professors, postdocs) and industry R&D teams who need to systematically discover unsolved research problems and gaps from the literature. They work across disciplines and use GapMiner to extract limitations, categorize gaps, and track opportunities in organized collections.

## Product Purpose

GapMiner automates the discovery of research gaps from academic papers. It scrapes content from arXiv, OpenReview, and ACL Anthology, then uses Google Gemini to identify limitations and unsolved problems. Researchers use it to find opportunities they'd otherwise miss in manual literature review. Success means faster, more thorough gap discovery and organized knowledge management.

## Brand Personality

Scholarly, minimal, focused. The interface should feel like a precise research instrument — calm, trustworthy, content-first. No noise, no decoration that doesn't serve comprehension. A tool that takes its work seriously and respects the user's time.

## Anti-references

Saturated AI slop: gradient text, glassmorphism as default, glowing borders, cream/sand/paper body backgrounds, animated gradient backgrounds, hero-metric templates with big-number-small-label layouts, identical card grids with icon+heading+text repeated endlessly. The current index.css contains several patterns that violate this — gradient-text classes, glass morphism utilities, and heavy glow effects should be stripped in favor of clean, restrained surfaces.

## Design Principles

1. **Content-first, decoration-never**: Every pixel must serve comprehension or navigation. If a visual element doesn't help the user read, filter, or act on research data, remove it.
2. **Restraint earns trust**: Scholarly work requires a calm interface. Avoid visual intensity — no bouncing, no glowing, no gradient text. Calm surfaces, clear hierarchy.
3. **Systematic, not generic**: Use the existing CSS token system intentionally. Don't reach for defaults (gray cards, blue buttons) when the brand already has defined roles.
4. **Precision over polish**: Every component should feel deliberate. Spacing, type scale, and color use follow a rationale, not a template.
5. **Reduce before you add**: The best design pass removes something, not adds something.

## Accessibility & Inclusion

Standard WCAG AA. Body text contrast ≥4.5:1, focus-visible states on all interactive elements, keyboard navigability, semantic HTML structure. Reduced motion support is already implemented. No special accommodations beyond reasonable defaults.
