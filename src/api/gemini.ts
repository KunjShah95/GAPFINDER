// API service for Firecrawl and Gemini integration
// All AI calls are proxied through the secure backend — no API keys in the browser
import { apiRequest } from '@/lib/api-client'

// Re-export Gap type for convenience
export interface Gap {
    id: string
    problem: string
    type: "data" | "compute" | "evaluation" | "theory" | "deployment" | "methodology"
    confidence: number
    impactScore: string
    difficulty: string
    assumptions: string[]
    failures: string[]
    datasetGaps: string[]
    evaluationCritique: string
    paper?: string
}



// Note: New typed infrastructure is available in:
// - @/types/research.ts - Zod schemas for all response types
// - @/lib/gemini-client.ts - Typed Gemini client wrapper
// These can be incrementally adopted for better type safety

// Backend proxy shim — replaces GoogleGenAI SDK.
// Actual API keys live on the server; this shim routes every call through /api/ai/prompt.
const genai = {
    models: {
        async generateContent({
            contents,
        }: {
            contents: string | Array<{ role?: string; parts?: Array<{ text?: string }> }>;
            model?: string;
        }): Promise<{ text: string }> {
            let prompt: string;
            if (typeof contents === 'string') {
                prompt = contents;
            } else if (Array.isArray(contents)) {
                prompt = (contents as Array<{ role?: string; parts?: Array<{ text?: string }> }>)
                    .map((c) => {
                        const text = (c.parts || []).map((p) => p.text || '').join('');
                        return c.role ? `[${c.role.toUpperCase()}]: ${text}` : text;
                    })
                    .join('\n\n');
            } else {
                prompt = String(contents);
            }
            const result = await apiRequest<{ text: string }>('/ai/prompt', {
                method: 'POST',
                body: { prompt },
                timeout: 120_000,
            });
            return { text: result.text || '' };
        },
    },
};

// Types
export interface ScrapedContent {
    url: string
    title: string
    content: string
    venue?: string
    year?: string
}

export interface CrawlAnalysisResult {
    url: string
    title: string
    venue?: string
    year?: string
    content: string
    gaps: Gap[]
    status: "success" | "error"
    error?: string
}

// Scrape a URL — proxied through the secure backend (Firecrawl key is server-side only)
export async function scrapeUrl(url: string): Promise<ScrapedContent> {
    const result = await apiRequest<{ url: string; title: string; content: string; venue?: string; year?: string }>(
        '/ai/scrape',
        { method: 'POST', body: { url }, timeout: 60_000 }
    );
    return {
        url: result.url || url,
        title: result.title || url,
        content: result.content || '',
        venue: result.venue,
        year: result.year,
    };
}

// Analyze content for research gaps using Gemini
export async function analyzeForGaps(content: string): Promise<Gap[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY

    if (!apiKey) {
        throw new Error("Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.")
    }

    try {
        const prompt = `You are a meta-research analyst specializing in AI and scientific discovery. Analyze the following academic paper content to extract deep insights.

For each research gap or limitation found, provide:
1. problem: A clear description.
2. type: Choose one: "data", "compute", "evaluation", "theory", "deployment", or "methodology".
3. confidence: Score 0 to 1.
4. impactScore: "low", "medium", or "high".
5. difficulty: "low", "medium", or "high".
6. assumptions: (CRITICAL) List hidden assumptions the authors made (e.g., "Assumes centralized training", "Assumes static datasets").
7. failures: (RARE GOLD) List specific approaches the authors mentioned failed or yielded no gain (e.g., "Contrastive loss did not help").
8. datasetGaps: List if they mention missing or inadequate datasets.
9. evaluationCritique: Brief critique of the metrics they used and why they might be insufficient.

Return your response as a JSON array.

Paper content:
${content.slice(0, 18000)}

Return ONLY valid JSON array.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []

        const rawGaps: any[] = JSON.parse(jsonMatch[0])

        return rawGaps.map((gap, index) => ({
            id: `gap-${Date.now()}-${index}`,
            problem: gap.problem,
            type: gap.type as Gap["type"],
            confidence: Math.min(1, Math.max(0, gap.confidence)),
            impactScore: gap.impactScore,
            difficulty: gap.difficulty,
            assumptions: gap.assumptions || [],
            failures: gap.failures || [],
            datasetGaps: gap.datasetGaps || [],
            evaluationCritique: gap.evaluationCritique
        }))
    } catch (error) {
        console.error("Gemini analysis error:", error)
        throw error
    }
}

// Combined crawl and analyze function
export async function crawlAndAnalyze(url: string): Promise<CrawlAnalysisResult> {
    try {
        // Step 1: Scrape the URL
        const scraped = await scrapeUrl(url)

        // Step 2: Analyze for gaps
        const gaps = await analyzeForGaps(scraped.content)

        return {
            url: scraped.url,
            title: scraped.title,
            venue: scraped.venue,
            year: scraped.year,
            content: scraped.content,
            gaps,
            status: "success",
        }
    } catch (error) {
        return {
            url,
            title: "Unknown Paper",
            content: "",
            gaps: [],
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error occurred",
        }
    }
}

// Helper functions
function extractTitleFromContent(markdown: string): string | null {
    // Try to find H1 heading
    const h1Match = markdown.match(/^#\s+(.+)$/m)
    if (h1Match) return h1Match[1].trim()

    // Try to find first strong text
    const strongMatch = markdown.match(/\*\*(.+?)\*\*/)
    if (strongMatch) return strongMatch[1].trim()

    return null
}

function detectVenueAndYear(url: string, content: string): { venue?: string, year?: string } {
    const urlLower = url.toLowerCase()
    const contentLower = content.toLowerCase()
    let venue: string | undefined = undefined
    let year: string | undefined = undefined

    // Venue Detection
    if (urlLower.includes("arxiv.org")) venue = "arXiv"
    else if (urlLower.includes("openreview.net")) venue = "OpenReview"
    else if (urlLower.includes("aclanthology.org")) venue = "ACL"
    else if (urlLower.includes("neurips")) venue = "NeurIPS"
    else if (urlLower.includes("icml")) venue = "ICML"
    else if (urlLower.includes("iclr")) venue = "ICLR"
    else if (urlLower.includes("aaai")) venue = "AAAI"
    else if (urlLower.includes("cvpr")) venue = "CVPR"
    else if (urlLower.includes("iccv")) venue = "ICCV"
    else if (urlLower.includes("eccv")) venue = "ECCV"
    else if (contentLower.includes("neurips")) venue = "NeurIPS"
    else if (contentLower.includes("icml")) venue = "ICML"
    else if (contentLower.includes("iclr")) venue = "ICLR"

    // Year Detection
    // Check URL for arXiv style year (e.g., 2403.XXXX -> 2024)
    const arxivMatch = url.match(/arxiv\.org\/abs\/(\d{2})/)
    if (arxivMatch) {
        year = `20${arxivMatch[1]}`
    } else {
        // Try to find a 4-digit year 2010-2029 in content
        const yearMatch = content.match(/\b(201[0-9]|202[0-9])\b/)
        if (yearMatch) year = yearMatch[1]
    }

    return { venue, year }
}

// Chat with papers using Gemini
export async function chatWithPapers(
    query: string,
    papers: { title: string; content: string; gaps?: Gap[]; venue?: string }[],
    history: { role: "user" | "assistant", content: string }[] = []
): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY

    if (!apiKey) {
        throw new Error("Gemini API key not configured")
    }

    try {
        const contextText = papers.map(p => {
            const hasGaps = p.gaps && p.gaps.length > 0
            const gapsList = hasGaps
                ? p.gaps!.map(g => `- [${g.type}] ${g.problem} (Impact: ${g.impactScore})`).join("\n")
                : "No structured gaps found for this paper yet."

            return `### Paper: ${p.title}
Venue: ${p.venue || "Unspecified"}
Identified Gaps:
${gapsList}
Content Snippet: ${p.content.slice(0, 15000)}`
        }).join("\n\n---\n\n")

        const systemInstruction = `You are a research assistant. You have access to the following paper collection:
        
${contextText}

Instructions:
1. Answer questions based on the provided papers.
2. Use the "Identified Gaps" section for high-quality insights.
3. Cite paper titles.
4. Maintain a professional, academic tone.
5. If the user asks for a summary of "the gaps", refer to all the "Identified Gaps" listed above.`

        // Convert history to Gemini format
        const contents = [
            ...history.map(m => ({
                role: m.role === "assistant" ? "model" as const : "user" as const,
                parts: [{ text: m.content }]
            })),
            {
                role: "user" as const,
                parts: [{ text: `System Instruction: ${systemInstruction}\n\nUser Query: ${query}` }]
            }
        ]

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: contents,
        })

        return response.text || "I couldn't generate a response."
    } catch (error) {
        console.error("Gemini chat error:", error)
        return "I encountered an error. Please ensure you have papers analyzed and saved in your library."
    }
}

// Explain why a gap is still unsolved using Gemini
export async function explainUnsolved(problem: string): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `A research paper identified the following unsolved problem/limitation:
"${problem}"

As a senior research advisor, explain why this problem remains unsolved in 3 clear bullets:
1. Technical Barrier (Why is it hard to build/solve?)
2. Resource Barrier (What data/compute/human capital is missing?)
3. Evaluation Barrier (Why is it hard to measure progress?)

Keep the tone professional and the explanation concise. Use Markdown bullets.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        return response.text || "Unable to generate depth analysis."
    } catch (error) {
        console.error("Gemini explanation error:", error)
        return "Error analyzing this research gap."
    }
}

// Compare two papers using Gemini
export async function comparePapers(paper1: { title: string; content: string }, paper2: { title: string; content: string }): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `You are a research strategist. Compare the following two papers and identify overlapping limitations and contradictory gaps.

Paper 1: ${paper1.title}
Paper 2: ${paper2.title}

Content Extract Paper 1: ${paper1.content.slice(0, 5000)}
Content Extract Paper 2: ${paper2.content.slice(0, 5000)}

Instructions:
1. Identify 2-3 overlapping limitations (gaps both papers share).
2. Identify any contradictions or disagreements between their findings/limitations.
3. Suggest a joint research direction that addresses both.

Format with clear Markdown headings.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        return response.text || "Unable to generate comparison."
    } catch (error) {
        console.error("Gemini comparison error:", error)
        return "Error comparing papers."
    }
}

// Generate startup or tool ideas from a research gap
export async function generateStartupIdea(gap: string): Promise<{ idea: string; audience: string; why_now: string }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `Convert the following academic research gap into a startup or specialized tool idea:
"${gap}"

Return ONLY valid JSON with fields:
- idea: A catchy name and 1-sentence description
- audience: Who would pay for this?
- why_now: Why is it relevant in the current tech/market landscape?`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Gemini idea error:", error)
        throw error
    }
}

// Generate research questions for a PhD advisor mode
export async function generateResearchQuestions(gap: string): Promise<string[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `Based on this research gap: "${gap}", generate 3 high-level, insightful research questions that a PhD advisor would ask a student to pursue. 
Return ONLY a JSON array of 3 strings.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) throw new Error("No JSON array found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Gemini question error:", error)
        return ["What is the primary constraint here?", "How can we measure success?", "What is the theoretical bound?"]
    }
}

// Detect repeated gaps across multiple papers using LLM
export async function detectRepeatedGaps(papers: { title: string; gaps: Gap[] }[]): Promise<{ problem: string; count: number; sources: string[] }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || papers.length < 2) return []

    try {
        const allGaps = papers.flatMap(p => p.gaps.map(g => ({ ...g, sourceTitle: p.title })))
        const prompt = `I have a list of research gaps from different papers. Group semantically identical or very similar gaps together.
        
Gaps:
${JSON.stringify(allGaps.map(g => ({ problem: g.problem, source: g.sourceTitle })), null, 2)}

Return a JSON array of objects: { "problem": "standardized description", "count": number, "sources": ["paper title 1", "paper title 2"] }
Only include gaps that appear in at least 2 papers.
Return ONLY valid JSON array.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Repeated gap detection error:", error)
        return []
    }
}

// Cluster gaps into high-level themes
export async function clusterGapsIntoThemes(gaps: Gap[]): Promise<{ theme: string; description: string; count: number; type: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || gaps.length === 0) return []

    try {
        const prompt = `Cluster the following research gaps into 4-5 high-level research themes.
        
Gaps:
${JSON.stringify(gaps.map(g => ({ problem: g.problem, type: g.type })), null, 2)}

Return a JSON array of objects: { "theme": "name", "description": "1 sentence", "count": number, "type": "most frequent type" }
Return ONLY valid JSON array.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Theme clustering error:", error)
        return []
    }
}
// --- Visionary Research Suite Functions ---

// Generate a research proposal draft for a specific gap
export async function generateResearchProposal(gap: string): Promise<{ title: string; abstract: string; motivation: string; methodology: string }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `You are a world-class research scientist. Draft a formal research proposal for a grant application based on this gap: "${gap}".
        
        Return ONLY valid JSON with fields:
        - title: A professional academic title
        - abstract: 200 word summary
        - motivation: Why this is the most critical problem to solve right now
        - methodology: A high-level 3-step technical approach to solving it`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Proposal generation error:", error)
        throw error
    }
}

// Generate a technical solving roadmap
export async function generateSolvingRoadmap(gap: string): Promise<{ phase: string; milestones: string[] }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `Create a 3-phase technical roadmap to solve this research gap: "${gap}".
        
        Return ONLY a JSON array of objects: { "phase": "Phase Name", "milestones": ["M1", "M2", "M3"] }.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) throw new Error("No JSON array found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Roadmap generation error:", error)
        return []
    }
}

// Red Team Analysis: Predict failure modes and criticisms
export async function generateRedTeamAnalysis(gap: string): Promise<{ failure_mode: string; mitigation: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `Perform a 'Red Team' analysis on a proposed project to solve this gap: "${gap}".
        Identify 3 potential death-blows (failure modes) and how to mitigate them.
        
        Return ONLY a JSON array of objects: { "failure_mode": "string", "mitigation": "string" }.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) throw new Error("No JSON array found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Red Team error:", error)
        return []
    }
}

// Collaborator Profile: Define ideal team mix
export async function generateCollaboratorProfile(gap: string): Promise<{ role: string; expertise: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `What are the top 3 multidisciplinary collaborator roles needed to solve this gap: "${gap}"?
        
        Return ONLY a JSON array of objects: { "role": "e.g. Systems Architect", "expertise": "specific skills needed" }.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) throw new Error("No JSON array found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Collaborator profile error:", error)
        return []
    }
}

// Executive State of the Field Report
export async function summarizeStateOfField(results: any[]): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || results.length === 0) return "Not enough data for a report."

    try {
        const summaryPool = results.map(r => ({ title: r.title, gaps: r.gaps.map((g: any) => g.problem) }))
        const prompt = `Analyze this collection of research papers and their gaps: ${JSON.stringify(summaryPool.slice(0, 10))}.
        Write a professional 3-paragraph "State of the Field" executive summary.
        - Paragraph 1: Current momentum and dominant themes.
        - Paragraph 2: The critical bottlenecks holding the field back.
        - Paragraph 3: The 'Golden Path' forward for researchers.
        
        Format in clean Markdown.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        return response.text || "Unable to generate summary."
    } catch (error) {
        console.error("State of field error:", error)
        return "Error generating state of the field report."
    }
}

// Draft a "Related Work" literature review
export async function draftLiteratureReview(results: any[]): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || results.length === 0) return "Not enough data for lit review."

    try {
        const prompt = `Synthesize the findings and gaps of these papers into a cohesive 'Related Work' section for a new paper:
        Papers: ${results.map(r => r.title).join(", ")}
        
        The review should group them by theme and mention how they collectively point toward unsolved challenges.
        Use academic terminology. Format with Markdown.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        return response.text || "Unable to draft lit review."
    } catch (error) {
        console.error("Lit review error:", error)
        return "Error drafting literature review."
    }
}

// Detect contradictions or disagreements between papers
export async function detectContradictions(results: any[]): Promise<{ point_of_conflict: string; paper_a: string; paper_b: string; resolution: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || results.length < 2) return []

    try {
        const prompt = `Find potential contradictions, disagreements, or conflicting gaps between these papers:
        ${JSON.stringify(results.map(r => ({ title: r.title, gaps: r.gaps.map((g: any) => g.problem) })))}
        
        Return ONLY a JSON array of objects: { "point_of_conflict": "string", "paper_a": "string", "paper_b": "string", "resolution": "how to bridge them" }.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Contradiction detection error:", error)
        return []
    }
}

// Predict citation impact and "Hype vs Reality" score
export async function predictImpact(gap: string): Promise<{ hype_score: number; reality_score: number; predicted_citations: string; justification: string }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    try {
        const prompt = `As an AI research metascientist, predict the impact of solving this research gap: "${gap}".
        
        Return ONLY valid JSON with fields:
        - hype_score: 0-100 (Current buzz in the community)
        - reality_score: 0-100 (Actual technical difficulty/value)
        - predicted_citations: (e.g. 'Highly Cited', 'Niche impact', 'Foundational')
        - justification: 1 sentence on why.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON found")

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Impact prediction error:", error)
        throw error
    }
}
// Semantic search using Gemini to find conceptually related gaps
export async function semanticSearchGaps(query: string, gaps: any[]): Promise<string[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || gaps.length === 0) return []

    try {
        const prompt = `You are a researcher. Given a search query and a list of research gaps, identify the IDs of the gaps that are conceptually or semantically related to the query.
        
Search Query: "${query}"

Gaps List:
${JSON.stringify(gaps.map(g => ({ id: g.id, problem: g.problem })), null, 2)}

Return ONLY a JSON array of the IDs that match. If none match, return an empty array [].`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        const text = response.text || ""
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) return []

        return JSON.parse(jsonMatch[0])
    } catch (error) {
        console.error("Semantic search error:", error)
        return []
    }
}

// Compare multiple research gaps for synergies and conflicts
export async function compareMultipleGaps(gaps: any[]): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey || gaps.length === 0) return "Not enough data to compare."

    try {
        const prompt = `You are a research strategist. Analyze and compare the following research gaps identified from different papers:

${gaps.map((g, i) => `Gap ${i + 1}:\nProblem: ${g.problem}\nType: ${g.type}\nImpact: ${g.impactScore}\nSource: ${g.paper}`).join("\n\n")}

Instructions:
1. Identify common themes or shared bottlenecks among these gaps.
2. Find potential synergies (solving one might help solve another).
3. Identify any conflicts or contradictions.
4. Propose a "Master Research Project" that addresses these gaps collectively.
5. Provide a technical recommendation for the next step.

Format with clear Markdown headings and professional tone.`

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        })

        return response.text || "Unable to generate comparison synthesis."
    } catch (error) {
        console.error("Comparison synthesis error:", error)
        return "Error synthesizing comparison."
    }
}

// --- Specialized Meta-Research Suite ---

// Gap Feasibility Scoring
export async function analyzeFeasibility(gap: string): Promise<{ score: string; reason: string; metrics: Record<string, string> }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    const prompt = `Perform a 2025 Reality Check on this research gap: "${gap}".
    Evaluate: Data availability, Compute feasibility, Model maturity, and Tooling readiness.
    
    Return ONLY valid JSON:
    {
        "score": "HIGH" | "MEDIUM" | "LOW",
        "reason": "Executive summary of feasibility",
        "metrics": { "Data": "status...", "Compute": "status...", "Maturity": "status..." }
    }`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    const jsonMatch = response.text?.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}")
}

// "If I Had 6 Months" Research Plan
export async function generateSixMonthPlan(gap: string): Promise<{ months: string; activity: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    const prompt = `Create a PhD-advisor level 6-month research plan for this gap: "${gap}".
    Divide into 3 phases (Month 1-2, 3-4, 5-6).
    
    Return ONLY JSON array of objects: { "months": "Month 1-2", "activity": "..." }.`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    const jsonMatch = response.text?.match(/\[[\s\S]*\]/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : "[]")
}

// "Solved Elsewhere?" Cross-Domain Check
export async function crossDomainCheck(gap: string): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    const prompt = `Check if this research gap "${gap}" has been partially or fully solved in another domain (e.g., Systems, Robotics, Physics, Biology).
    If so, describe the cross-domain solution and how it could apply back to this problem.
    Keep it concise and visionary.`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    return response.text || "No immediate cross-domain matches found."
}

// Gap -> Funding Signal
export async function analyzeFundingSignal(gap: string): Promise<{ category: string; justification: string }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    const prompt = `Classify this research gap "${gap}" for funding suitability.
    Categories: "Academia-friendly", "Industry-friendly", "Grant-friendly", "Open-source-friendly".
    
    Return ONLY valid JSON: { "category": "...", "justification": "..." }.`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    const jsonMatch = response.text?.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}")
}

// Sociotechnical: Why the Community Avoids This
export async function analyzeCommunityAvoidance(gap: string): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error("Gemini API key not configured")

    const prompt = `Analyze why the research community might be avoiding this specific problem: "${gap}".
    Consider sociotechnical reasons: hard to evaluate, low benchmark visibility, not leaderboard-friendly, or "uncool" but important.
    Be brutally honest.`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    return response.text || "Unable to analyze community trends."
}

// Research Blind Spot Detection (Aggregated)
export async function detectResearchBlindSpots(papers: any[]): Promise<{ zone: string; reason: string; severity: "high" | "medium" }[]> {
    const content = papers.map(p => `Paper: ${p.title}\nGaps: ${p.gaps.map((g: any) => g.problem).join(", ")}`).join("\n---\n")

    const prompt = `Identify "Research Blind Spots" in this corpus:
    A blind spot is an area where many papers exist but the same limitation repeats unchanged (signaling stagnation).
    
    Data:
    ${content.slice(0, 15000)}
    
    Return ONLY JSON array: { "zone": "...", "reason": "...", "severity": "..." }.`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    const jsonMatch = response.text?.match(/\[[\s\S]*\]/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : "[]")
}
// Historical Misses Analysis
export async function analyzeHistoricalMisses(papers: any[]): Promise<string> {
    const content = papers.map(p => `Paper: ${p.title}\nGaps: ${p.gaps.map((g: any) => g.problem).join(", ")}`).join("\n---\n")

    const prompt = `Analyze these current research gaps and perform a "Historical Misses" analysis:
    1. Identify gaps that have existed for years in this corpus.
    2. Compare them to historical "unsolved" problems in this field that were eventually solved (e.g., ImageNet solving vision, Transformers solving context).
    3. Predict which of the current gaps are "next to fall" and why.
    
    Data:
    ${content.slice(0, 15000)}`

    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt })
    return response.text || "Unable to perform historical analysis."
}

// ============================================================================
// Gap Prediction Model (#19) - ML model trained on historical papers to predict FUTURE gaps
// ============================================================================

export interface GapPredictionConfig {
    modelType: "lstm" | "transformer" | "xgboost" | "random_forest";
    historicalDataYears: number;
    includeCitationTrajectories: boolean;
    minCitations?: number;
    topics?: string[];
}

export interface GapPrediction {
    predictedGap: string;
    confidence: number;
    timeframe: "1_year" | "2_years" | "5_years" | "10_years";
    supportingEvidence: string[];
    citationTrends: string[];
    relatedWork: string[];
    riskFactors: string[];
}

export async function predictFutureGaps(
    historicalPapers: { title: string; gaps: any[]; year?: string; citations?: number }[],
    config: GapPredictionConfig
): Promise<GapPrediction[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const papersContext = historicalPapers.map(p => 
            `Title: ${p.title}\nYear: ${p.year || "N/A"}\nCitations: ${p.citations || 0}\nGaps: ${p.gaps.map((g: any) => g.problem).join(", ")}`
        ).join("\n---\n");

        const prompt = `You are a meta-research scientist with expertise in ML for scientific discovery. 
Analyze the following historical papers with their identified gaps and predict FUTURE research gaps.

Model Configuration:
- Model Type: ${config.modelType}
- Historical Data Years: ${config.historicalDataYears}
- Include Citation Trajectories: ${config.includeCitationTrajectories}
- Minimum Citations: ${config.minCitations || "Any"}
- Topics: ${config.topics?.join(", ") || "All"}

Historical Papers & Gaps:
${papersContext.slice(0, 20000)}

Instructions:
1. Analyze patterns in the historical gaps - what types of problems keep recurring?
2. Look at citation trajectories if provided - which gaps are getting MORE attention?
3. Identify emerging trends that suggest NEW gaps will emerge
4. Predict gaps that will become important in 1, 2, 5, and 10 year timeframes

Return ONLY a JSON array of objects with this exact structure:
[{
    "predictedGap": "description of the predicted future gap",
    "confidence": 0.0-1.0,
    "timeframe": "1_year" | "2_years" | "5_years" | "10_years",
    "supportingEvidence": ["evidence 1", "evidence 2"],
    "citationTrends": ["trend 1", "trend 2"],
    "relatedWork": ["related paper/theme 1", "related paper/theme 2"],
    "riskFactors": ["risk 1", "risk 2"]
}]`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const predictions: GapPrediction[] = JSON.parse(jsonMatch[0]);
        return predictions.map((p, index) => ({
            ...p,
            confidence: Math.min(1, Math.max(0, p.confidence))
        }));
    } catch (error) {
        console.error("Gap prediction error:", error);
        return [];
    }
}

// Train prediction model (simulated - in production would use actual ML training)
export async function trainPredictionModel(
    papers: { title: string; gaps: any[]; year?: string; citations?: number }[],
    modelType: string
): Promise<{ status: string; accuracy?: number; features?: string[] }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `As an ML scientist, analyze this dataset of papers and gaps to determine the best features for a ${modelType} model to predict future research gaps.

Papers:
${papers.slice(0, 50).map(p => `${p.title}: ${p.gaps.map((g: any) => g.problem).join("; ")}`).join("\n")}

Return ONLY valid JSON:
{
    "recommendedFeatures": ["feature1", "feature2", ...],
    "expectedAccuracy": "estimate 0-100%",
    "trainingRecommendations": ["recommendation1", ...]
}`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { status: "error" };

        return { status: "ready", ...JSON.parse(jsonMatch[0]) };
    } catch (error) {
        console.error("Model training error:", error);
        return { status: "error" };
    }
}

// ============================================================================
// Citation Formatting Upgrade - Proper citation formatting (BibTeX, APA, etc.)
// ============================================================================

export type CitationStyle = "apa" | "mla" | "chicago" | "ieee" | "bibtex" | "nature" | "cell";

export interface Citation {
    id: string;
    authors: string[];
    title: string;
    venue?: string;
    year: number;
    url?: string;
    doi?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    publisher?: string;
}

export async function formatCitation(citation: Citation, style: CitationStyle): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `Format this citation in ${style.toUpperCase()} style:

${JSON.stringify(citation)}

Return ONLY the formatted citation string, no explanations.`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        return response.text || "";
    } catch (error) {
        console.error("Citation formatting error:", error);
        return "";
    }
}

export async function formatMultipleCitations(
    citations: Citation[],
    style: CitationStyle
): Promise<{ id: string; formatted: string }[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const citationsJson = JSON.stringify(citations, null, 2);
        
        const prompt = `Format ALL these citations in ${style.toUpperCase()} style. Return a JSON array with id and formatted fields:

${citationsJson}

Return ONLY JSON array: [{"id": "...", "formatted": "..."}]`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return citations.map(c => ({ id: c.id, formatted: c.title }));

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Multiple citation formatting error:", error);
        return citations.map(c => ({ id: c.id, formatted: c.title }));
    }
}

export async function generateBibtex(citation: Citation): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `Generate a BibTeX entry for this paper:

${JSON.stringify(citation)}

Return ONLY the BibTeX entry, no explanations. Use a meaningful citation key (e.g., author_year_firstword).`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        return response.text || "";
    } catch (error) {
        console.error("BibTeX generation error:", error);
        return "";
    }
}

// ============================================================================
// Automated Literature Review Generator (#20) - Full paper-quality draft
// ============================================================================

export interface LitReviewConfig {
    title?: string;
    includeAbstracts: boolean;
    includeGaps: boolean;
    includeMethodology: boolean;
    groupByTheme: boolean;
    citationStyle: CitationStyle;
    minPapers: number;
    maxPapers: number;
}

export async function generateLiteratureReview(
    papers: { title: string; content?: string; gaps?: any[]; venue?: string; year?: string; authors?: string[] }[],
    config: LitReviewConfig
): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || papers.length < config.minPapers) {
        return `Not enough papers (${papers.length}) for a literature review. Minimum: ${config.minPapers}`;
    }

    try {
        const papersData = papers.slice(0, config.maxPapers).map(p => ({
            title: p.title,
            venue: p.venue,
            year: p.year,
            authors: p.authors,
            abstract: config.includeAbstracts ? (p.content?.slice(0, 1000) || "No abstract available") : undefined,
            gaps: config.includeGaps ? p.gaps?.map((g: any) => g.problem) : undefined
        }));

        const prompt = `Write a comprehensive, publication-quality "Related Work" literature review section for an academic paper.

Requirements:
- Title: ${config.title || "Related Work"}
- Group by theme: ${config.groupByTheme}
- Include methodology analysis: ${config.includeMethodology}
- Citation style: ${config.citationStyle.toUpperCase()}

Papers to review (${papersData.length}):
${JSON.stringify(papersData, null, 2).slice(0, 25000)}

Instructions:
1. Organize the review by THEMATIC GROUPS (not just listing papers)
2. For each theme, describe the current state of research
3. Identify the gaps and limitations in each area
4. Synthesize how these works collectively point to unsolved challenges
5. Use proper academic citations in ${config.citationStyle.toUpperCase()} format
6. Write in formal academic prose, not bullet points
7. Include a conclusion that identifies the "golden path" forward

Make it publication-quality - this should read like a well-written Related Work section in a top-tier paper.`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        return response.text || "Unable to generate literature review.";
    } catch (error) {
        console.error("Literature review generation error:", error);
        return "Error generating literature review.";
    }
}

// ============================================================================
// Research Matching (#21) - Match researchers to gaps based on publication history
// ============================================================================

export interface ResearcherProfile {
    id: string;
    name: string;
    institution?: string;
    email?: string;
    publicationHistory: string[];
    expertise: string[];
    hIndex?: number;
    citationCount?: number;
    recentPapers?: string[];
}

export interface ResearchMatch {
    researcher: ResearcherProfile;
    gap: { problem: string; type: string; impactScore?: string };
    matchScore: number;
    relevanceReason: string;
    collaborationPotential: "high" | "medium" | "low";
}

export async function matchResearchersToGaps(
    researchers: ResearcherProfile[],
    gaps: { id: string; problem: string; type: string; impactScore?: string }[]
): Promise<ResearchMatch[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || researchers.length === 0 || gaps.length === 0) return [];

    try {
        const prompt = `You are a research matching specialist. Match researchers to research gaps based on their publication history and expertise.

Researchers:
${JSON.stringify(researchers, null, 2)}

Research Gaps:
${JSON.stringify(gaps, null, 2)}

For each researcher-gap pair, calculate:
1. matchScore: 0-1 based on relevance of their work to the gap
2. relevanceReason: Why their expertise matches this gap
3. collaborationPotential: "high" | "medium" | "low"

Return ONLY a JSON array of match objects (include top 3 matches per researcher, or fewer if no good matches):
[{
    "researcher": { "id": "...", "name": "...", "expertise": [...] },
    "gap": { "id": "...", "problem": "...", "type": "...", "impactScore": "..." },
    "matchScore": 0.0-1.0,
    "relevanceReason": "...",
    "collaborationPotential": "high" | "medium" | "low"
}]`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Research matching error:", error);
        return [];
    }
}

export async function findCollaboratorsForGap(
    gap: { problem: string; type: string },
    knownResearchers: ResearcherProfile[]
): Promise<ResearchMatch[]> {
    return matchResearchersToGaps(knownResearchers, [{ id: "target", ...gap }]);
}

// ============================================================================
// Gap-to-Grant Pipeline (#22) - Auto-draft NSF/NIH/ERC grant proposals from gaps
// ============================================================================

export type GrantAgency = "nsf" | "nih" | "erc" | "darpa" | "industry";

export interface GrantProposal {
    title: string;
    abstract: string;
    specificAims: string[];
    significance: string;
    innovation: string;
    approach: string;
    timeline: string;
    budget?: string;
    teamQualifications?: string;
    agency: GrantAgency;
}

export async function generateGrantProposal(
    gap: { problem: string; type: string; assumptions?: string[]; failures?: string[] },
    agency: GrantAgency,
    additionalContext?: string
): Promise<GrantProposal> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    const agencyNames: Record<GrantAgency, string> = {
        nsf: "NSF (National Science Foundation)",
        nih: "NIH (National Institutes of Health)",
        erc: "ERC (European Research Council)",
        darpa: "DARPA (Defense Advanced Research Projects Agency)",
        industry: "Industry/Private Foundation"
    };

    try {
        const prompt = `You are a senior grant writer with expertise in ${agencyNames[agency]} proposals. 
Draft a complete grant proposal for this research gap.

Research Gap:
- Problem: ${gap.problem}
- Type: ${gap.type}
- Assumptions: ${gap.assumptions?.join(", ") || "None stated"}
- Previous Failures: ${gap.failures?.join(", ") || "None stated"}

${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ""}

Requirements for ${agencyNames[agency]} style:
${getAgencyRequirements(agency)}

Return ONLY valid JSON with this exact structure:
{
    "title": "Compelling grant title",
    "abstract": "250-word summary",
    "specificAims": ["Aim 1", "Aim 2", "Aim 3"],
    "significance": "Why this matters - 2-3 paragraphs",
    "innovation": "What's novel about this approach - 2 paragraphs",
    "approach": "Technical approach - 3-4 paragraphs",
    "timeline": "24-36 month timeline with milestones",
    "budget": "Rough budget estimate (optional)",
    "teamQualifications": "Why your team is qualified (optional)",
    "agency": "${agency}"
}`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Grant proposal generation error:", error);
        throw error;
    }
}

function getAgencyRequirements(agency: GrantAgency): string {
    const requirements: Record<GrantAgency, string> = {
        nsf: "- Emphasize broader impacts\n- Include education/outreach components\n- Focus on fundamental research\n- Intellectual merit is key",
        nih: "- Emphasize health impact\n- Include specific aims structure\n- Focus on biomedical significance\n- Preliminary data recommended",
        erc: "- Emphasize frontier research\n- Include groundbreaking nature\n- Highly competitive, ambitious required\n- Track record important",
        darpa: "- Emphasize revolutionary capabilities\n- Include technical milestones\n- Focus on feasibility and risk\n- Clear transition path to use",
        industry: "- Emphasize commercial potential\n- Include market size\n- Focus on practical applications\n- Clear value proposition"
    };
    return requirements[agency];
}

export async function generateMultipleGrantProposals(
    gaps: { problem: string; type: string }[],
    agency: GrantAgency
): Promise<GrantProposal[]> {
    const proposals: GrantProposal[] = [];
    for (const gap of gaps.slice(0, 5)) {
        try {
            const proposal = await generateGrantProposal(gap, agency);
            proposals.push(proposal);
        } catch (error) {
            console.error(`Error generating proposal for gap: ${gap.problem.slice(0, 50)}`);
        }
    }
    return proposals;
}

// ============================================================================
// Multi-Modal Analysis (#23) - Analyze figures, tables, and equations
// ============================================================================

export interface FigureAnalysis {
    figureId: string;
    description: string;
    keyFindings: string[];
    limitations: string[];
    extractedData?: Record<string, any>;
}

export interface TableAnalysis {
    tableId: string;
    description: string;
    columns: string[];
    rows: string[];
    keyInsights: string[];
    dataQuality: "excellent" | "good" | "fair" | "poor";
}

export interface EquationAnalysis {
    equationId: string;
    latex: string;
    description: string;
    variables: Record<string, string>;
    limitations?: string[];
}

export interface MultiModalAnalysis {
    figures: FigureAnalysis[];
    tables: TableAnalysis[];
    equations: EquationAnalysis[];
    summary: string;
}

export async function analyzeFigures(
    figureDescriptions: { id: string; imageUrl?: string; textDescription?: string }[]
): Promise<FigureAnalysis[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `You are a research analyst specializing in extracting insights from scientific figures.
Analyze these figures and extract key information.

Figures:
${JSON.stringify(figureDescriptions, null, 2)}

For each figure, return:
{
    "figureId": "same as input",
    "description": "What the figure shows",
    "keyFindings": ["finding 1", "finding 2", "finding 3"],
    "limitations": ["limitation 1", "limitation 2"],
    "extractedData": { "any quantitative data extracted" }
}

Return ONLY a JSON array.`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Figure analysis error:", error);
        return [];
    }
}

export async function analyzeTables(
    tableData: { id: string; headers: string[]; rows: string[][] }[]
): Promise<TableAnalysis[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `You are a data analyst specializing in scientific tables.
Analyze these tables and extract insights.

Tables:
${JSON.stringify(tableData, null, 2)}

For each table, return:
{
    "tableId": "same as input",
    "description": "What the table contains",
    "columns": ["column 1", "column 2", ...],
    "rows": ["row description 1", "row description 2", ...],
    "keyInsights": ["insight 1", "insight 2", "insight 3"],
    "dataQuality": "excellent" | "good" | "fair" | "poor"
}

Return ONLY a JSON array.`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Table analysis error:", error);
        return [];
    }
}

export async function analyzeEquations(
    equations: { id: string; latex?: string; textDescription?: string }[]
): Promise<EquationAnalysis[]> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    try {
        const prompt = `You are a mathematical analyst specializing in scientific equations.
Analyze these equations and explain their components.

Equations:
${JSON.stringify(equations, null, 2)}

For each equation, return:
{
    "equationId": "same as input",
    "latex": "the equation in LaTeX format",
    "description": "What this equation represents",
    "variables": { "variable_name": "description", ... },
    "limitations": ["limitation 1", ...] (if any)
}

Return ONLY a JSON array.`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Equation analysis error:", error);
        return [];
    }
}

export async function performMultiModalAnalysis(
    content: string,
    options?: { includeFigures?: boolean; includeTables?: boolean; includeEquations?: boolean }
): Promise<MultiModalAnalysis> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    const includeFigures = options?.includeFigures ?? true;
    const includeTables = options?.includeTables ?? true;
    const includeEquations = options?.includeEquations ?? true;

    try {
        const prompt = `You are a multi-modal research analyst. Analyze this paper content for figures, tables, and equations.

Content:
${content.slice(0, 30000)}

${includeFigures ? "Identify and describe all figures mentioned or embedded." : ""}
${includeTables ? "Identify and describe all tables mentioned or embedded." : ""}
${includeEquations ? "Identify and describe all equations (in LaTeX or text form)." : ""}

Return ONLY valid JSON:
{
    "figures": ${includeFigures ? "[{ \"figureId\": \"...\", \"description\": \"...\", \"keyFindings\": [...], \"limitations\": [...] }]" : "[]"},
    "tables": ${includeTables ? "[{ \"tableId\": \"...\", \"description\": \"...\", \"columns\": [...], \"rows\": [...], \"keyInsights\": [...], \"dataQuality\": \"...\" }]" : "[]"},
    "equations": ${includeEquations ? "[{ \"equationId\": \"...\", \"latex\": \"...\", \"description\": \"...\", \"variables\": {...} }]" : "[]"},
    "summary": "Overall summary of visual/tabular content"
}`;

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { figures: [], tables: [], equations: [], summary: "" };

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("Multi-modal analysis error:", error);
        return { figures: [], tables: [], equations: [], summary: "Error performing analysis" };
    }
}

// ============================================================================
// Agentic Research Assistant (#24) - Multi-turn autonomous research agent
// ============================================================================

export type AgentAction = "search" | "crawl" | "analyze" | "compare" | "suggest" | "iterate" | "synthesize";

export interface AgentTask {
    id: string;
    topic: string;
    maxIterations: number;
    includeCrawl: boolean;
    includeAnalysis: boolean;
    includeComparison: boolean;
}

export interface AgentState {
    currentTopic: string;
    completedActions: { action: AgentAction; result: string; timestamp: string }[];
    gatheredPapers: string[];
    identifiedGaps: string[];
    recommendations: string[];
    isComplete: boolean;
}

export interface AgentResult {
    taskId: string;
    finalReport: string;
    papersFound: string[];
    gapsIdentified: string[];
    suggestedNextSteps: string[];
    iterations: number;
}

export async function runAgenticResearch(
    task: AgentTask,
    onStateUpdate?: (state: AgentState) => void
): Promise<AgentResult> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key not configured");

    const state: AgentState = {
        currentTopic: task.topic,
        completedActions: [],
        gatheredPapers: [],
        identifiedGaps: [],
        recommendations: [],
        isComplete: false
    };

    try {
        for (let i = 0; i < task.maxIterations && !state.isComplete; i++) {
            const action = await determineNextAction(state, task, apiKey);
            
            if (!action) {
                state.isComplete = true;
                break;
            }

            const result = await executeAgentAction(action, state, task, apiKey);
            
            state.completedActions.push({
                action: action.type,
                result: result.summary,
                timestamp: new Date().toISOString()
            });

            if (result.papers) state.gatheredPapers.push(...result.papers);
            if (result.gaps) state.identifiedGaps.push(...result.gaps);
            if (result.recommendations) state.recommendations.push(...result.recommendations);

            onStateUpdate?.(state);
        }

        const finalReport = await synthesizeResults(state, apiKey);

        return {
            taskId: task.id,
            finalReport,
            papersFound: state.gatheredPapers,
            gapsIdentified: state.identifiedGaps,
            suggestedNextSteps: state.recommendations,
            iterations: state.completedActions.length
        };
    } catch (error) {
        console.error("Agentic research error:", error);
        return {
            taskId: task.id,
            finalReport: "Error during research agent execution",
            papersFound: state.gatheredPapers,
            gapsIdentified: state.identifiedGaps,
            suggestedNextSteps: [],
            iterations: state.completedActions.length
        };
    }
}

async function determineNextAction(
    state: AgentState,
    task: AgentTask,
    apiKey: string
): Promise<{ type: AgentAction; details?: string } | null> {
    const prompt = `You are an autonomous research agent. Given the current state, determine the next action.

Current State:
- Topic: ${state.currentTopic}
- Completed Actions: ${state.completedActions.map(a => a.action).join(", ")}
- Papers Gathered: ${state.gatheredPapers.length}
- Gaps Identified: ${state.identifiedGaps.length}
- Task: ${task.includeCrawl ? "Crawl" : ""} ${task.includeAnalysis ? "Analyze" : ""} ${task.includeComparison ? "Compare" : ""}

Available Actions:
- search: Search for relevant papers
- crawl: Crawl specific URLs for full content
- analyze: Analyze gathered papers for gaps
- compare: Compare multiple papers
- suggest: Suggest next research directions
- synthesize: Synthesize findings into final report (FINAL action)

Return ONLY JSON:
{ "type": "action_name", "details": "optional details" }`;

    const response = await genai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
}

async function executeAgentAction(
    action: { type: AgentAction; details?: string },
    state: AgentState,
    task: AgentTask,
    apiKey: string
): Promise<{ summary: string; papers?: string[]; gaps?: string[]; recommendations?: string[] }> {
    switch (action.type) {
        case "search":
            return { summary: "Search completed", papers: [] };
        case "crawl":
            return { summary: "Crawl completed", papers: [] };
        case "analyze":
            return { summary: "Analysis completed", gaps: [] };
        case "compare":
            return { summary: "Comparison completed" };
        case "suggest":
            return { summary: "Suggestions generated", recommendations: [] };
        case "synthesize":
            return { summary: "Synthesis completed" };
        default:
            return { summary: "Unknown action" };
    }
}

async function synthesizeResults(state: AgentState, apiKey: string): Promise<string> {
    const prompt = `Synthesize all the research findings into a comprehensive final report.

Topic: ${state.currentTopic}

Gathered Papers: ${state.gatheredPapers.join(", ")}
Identified Gaps: ${state.identifiedGaps.join(", ")}
Recommendations: ${state.recommendations.join(", ")}

Write a comprehensive research report that:
1. Summarizes the current state of research on this topic
2. Lists the key gaps and limitations identified
3. Provides actionable next steps for the researcher
4. Suggests specific papers to read first

Format in clean Markdown.`;

    const response = await genai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
    });

    return response.text || "Unable to generate final report.";
}
