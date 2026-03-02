// Research Paper Summarizer — proxied through the secure backend
import { apiRequest } from '@/lib/api-client'

// Backend proxy shim — same shape as GoogleGenAI.models.generateContent
const genai = {
    models: {
        async generateContent({
            contents,
        }: {
            contents: string;
            model?: string;
        }): Promise<{ text: string }> {
            const result = await apiRequest<{ text: string }>('/ai/prompt', {
                method: 'POST',
                body: { prompt: contents },
                timeout: 120_000,
            });
            return { text: result.text || '' };
        },
    },
};

export interface PaperSummary {
  title: string
  abstract: string
  keyContributions: string[]
  methodology: string[]
  limitations: string[]
  futureWork: string[]
  impactScore: number
  tldr: string
  keyFigures?: string[]
  datasets?: string[]
}

export interface SummaryOptions {
  includeAbstract?: boolean
  includeContributions?: boolean
  includeMethodology?: boolean
  includeLimitations?: boolean
  includeFutureWork?: boolean
  style?: "concise" | "detailed" | "technical"
}

export async function summarizePaper(
  content: string,
  options: SummaryOptions = {}
): Promise<PaperSummary> {
  const {
    includeAbstract = true,
    includeContributions = true,
    includeMethodology = true,
    includeLimitations = true,
    includeFutureWork = true,
    style = "detailed"
  } = options

  const styleInstructions = {
    concise: "Keep summaries brief and to the point.",
    detailed: "Provide comprehensive details in each section.",
    technical: "Use technical terminology and focus on methodology.",
  }

  const prompt = `Analyze this research paper and provide a structured summary.

Paper content:
${content.slice(0, 25000)}

Style: ${styleInstructions[style]}

Return ONLY valid JSON matching this structure:
{
  "title": "Paper title if available",
  "abstract": "A clear summary of the paper's main contribution",
  "keyContributions": ["contribution1", "contribution2", "contribution3"],
  "methodology": ["method1", "method2"],
  "limitations": ["limitation1", "limitation2"],
  "futureWork": ["suggestion1", "suggestion2"],
  "impactScore": 0-100,
  "tldr": "One sentence summary",
  "keyFigures": ["figure descriptions if mentioned"],
  "datasets": ["datasets used if mentioned"]
}

Return ONLY valid JSON:`

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    })

    const text = response.text || ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return createFallbackSummary()
    }

    const summary = JSON.parse(jsonMatch[0])
    return {
      title: summary.title || "Unknown Title",
      abstract: summary.abstract || content.slice(0, 500),
      keyContributions: summary.keyContributions || [],
      methodology: summary.methodology || [],
      limitations: summary.limitations || [],
      futureWork: summary.futureWork || [],
      impactScore: summary.impactScore || 50,
      tldr: summary.tldr || "Research paper requiring further review",
      keyFigures: summary.keyFigures || [],
      datasets: summary.datasets || [],
    }
  } catch (error) {
    console.error("Summarization error:", error)
    return createFallbackSummary()
  }
}

function createFallbackSummary(): PaperSummary {
  return {
    title: "Paper Summary",
    abstract: "Unable to generate summary. Please review the paper manually.",
    keyContributions: [],
    methodology: [],
    limitations: [],
    futureWork: [],
    impactScore: 50,
    tldr: "Manual review required",
    keyFigures: [],
    datasets: [],
  }
}

export async function compareSummaries(
  papers: Array<{ id: string; content: string; title: string }>
): Promise<string> {
  const summaries = await Promise.all(
    papers.map(async (p) => {
      const summary = await summarizePaper(p.content, { style: "concise" })
      return `# ${p.title}\n${summary.tldr}\nImpact: ${summary.impactScore}/100`
    })
  )

  const prompt = `Compare these research papers and identify:
1. Common themes
2. Contradictory findings
3. Complementary approaches
4. Which paper has the highest potential impact

Papers:
${summaries.join("\n\n---\n\n")}

Provide a clear comparison analysis.`

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    })
    return response.text || "Unable to generate comparison."
  } catch (error) {
    return "Comparison generation failed."
  }
}

export function generateBulletSummary(summary: PaperSummary): string {
  const bullets = [
    `**TL;DR**: ${summary.tldr}`,
    `**Impact Score**: ${summary.impactScore}/100`,
    "",
  ]

  if (summary.keyContributions.length > 0) {
    bullets.push("**Key Contributions:**")
    summary.keyContributions.forEach((c) => bullets.push(`- ${c}`))
    bullets.push("")
  }

  if (summary.limitations.length > 0) {
    bullets.push("**Limitations:**")
    summary.limitations.forEach((l) => bullets.push(`- ${l}`))
    bullets.push("")
  }

  if (summary.futureWork.length > 0) {
    bullets.push("**Future Work:**")
    summary.futureWork.forEach((f) => bullets.push(`- ${f}`))
  }

  return bullets.join("\n")
}
