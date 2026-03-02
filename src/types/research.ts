// Centralized type definitions for GapMiner
import { z } from 'zod';

// ============================================================================
// Core Research Types
// ============================================================================

export const GapTypeEnum = z.enum([
    "data",
    "compute",
    "evaluation",
    "theory",
    "deployment",
    "methodology"
]);
export type GapType = z.infer<typeof GapTypeEnum>;

export const ImpactScoreEnum = z.enum(["low", "medium", "high"]);
export type ImpactScore = z.infer<typeof ImpactScoreEnum>;

export const DifficultyEnum = z.enum(["low", "medium", "high"]);
export type Difficulty = z.infer<typeof DifficultyEnum>;

// ============================================================================
// Gap Schema and Type
// ============================================================================

export const GapSchema = z.object({
    problem: z.string().min(1, "Problem description is required"),
    type: GapTypeEnum,
    confidence: z.number().min(0).max(1),
    impactScore: ImpactScoreEnum.optional(),
    difficulty: DifficultyEnum.optional(),
    assumptions: z.array(z.string()).optional().default([]),
    failures: z.array(z.string()).optional().default([]),
    datasetGaps: z.array(z.string()).optional().default([]),
    evaluationCritique: z.string().optional()
});

export const GapWithIdSchema = GapSchema.extend({
    id: z.string()
});

export type Gap = z.infer<typeof GapWithIdSchema>;
export type GapInput = z.infer<typeof GapSchema>;

// ============================================================================
// Startup Idea Types
// ============================================================================

export const StartupIdeaSchema = z.object({
    idea: z.string(),
    audience: z.string(),
    why_now: z.string()
});
export type StartupIdea = z.infer<typeof StartupIdeaSchema>;

// ============================================================================
// Research Proposal Types
// ============================================================================

export const ResearchProposalSchema = z.object({
    title: z.string(),
    abstract: z.string(),
    motivation: z.string(),
    methodology: z.string()
});
export type ResearchProposal = z.infer<typeof ResearchProposalSchema>;

// ============================================================================
// Roadmap Types
// ============================================================================

export const RoadmapPhaseSchema = z.object({
    phase: z.string(),
    milestones: z.array(z.string())
});
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;

// ============================================================================
// Red Team Analysis Types
// ============================================================================

export const RedTeamAnalysisSchema = z.object({
    failure_mode: z.string(),
    mitigation: z.string()
});
export type RedTeamAnalysis = z.infer<typeof RedTeamAnalysisSchema>;

// ============================================================================
// Collaborator Profile Types
// ============================================================================

export const CollaboratorProfileSchema = z.object({
    role: z.string(),
    expertise: z.string()
});
export type CollaboratorProfile = z.infer<typeof CollaboratorProfileSchema>;

// ============================================================================
// Contradiction Detection Types
// ============================================================================

export const ContradictionSchema = z.object({
    point_of_conflict: z.string(),
    paper_a: z.string(),
    paper_b: z.string(),
    resolution: z.string()
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

// ============================================================================
// Impact Prediction Types
// ============================================================================

export const ImpactPredictionSchema = z.object({
    hype_score: z.number().min(0).max(100),
    reality_score: z.number().min(0).max(100),
    predicted_citations: z.string(),
    justification: z.string()
});
export type ImpactPrediction = z.infer<typeof ImpactPredictionSchema>;

// ============================================================================
// Feasibility Analysis Types
// ============================================================================

export const FeasibilityAnalysisSchema = z.object({
    score: z.enum(["HIGH", "MEDIUM", "LOW"]),
    reason: z.string(),
    metrics: z.record(z.string(), z.string())
});
export type FeasibilityAnalysis = z.infer<typeof FeasibilityAnalysisSchema>;

// ============================================================================
// Six Month Plan Types
// ============================================================================

export const SixMonthPlanSchema = z.object({
    months: z.string(),
    activity: z.string()
});
export type SixMonthPlan = z.infer<typeof SixMonthPlanSchema>;

// ============================================================================
// Funding Signal Types
// ============================================================================

export const FundingSignalSchema = z.object({
    category: z.string(),
    justification: z.string()
});
export type FundingSignal = z.infer<typeof FundingSignalSchema>;

// ============================================================================
// Research Blind Spot Types
// ============================================================================

export const ResearchBlindSpotSchema = z.object({
    zone: z.string(),
    reason: z.string(),
    severity: z.enum(["high", "medium"])
});
export type ResearchBlindSpot = z.infer<typeof ResearchBlindSpotSchema>;

// ============================================================================
// Repeated Gap Types
// ============================================================================

export const RepeatedGapSchema = z.object({
    problem: z.string(),
    count: z.number(),
    sources: z.array(z.string())
});
export type RepeatedGap = z.infer<typeof RepeatedGapSchema>;

// ============================================================================
// Theme Cluster Types
// ============================================================================

export const ThemeClusterSchema = z.object({
    theme: z.string(),
    description: z.string(),
    count: z.number(),
    type: z.string()
});
export type ThemeCluster = z.infer<typeof ThemeClusterSchema>;

// ============================================================================
// URL Validation
// ============================================================================

export const ALLOWED_PAPER_DOMAINS = [
    'arxiv.org',
    'openreview.net',
    'aclanthology.org',
    'papers.nips.cc',
    'neurips.cc',
    'proceedings.mlr.press',
    'aclweb.org',
    'semanticscholar.org',
    'dl.acm.org',
    'ieee.org'
];

export function isValidPaperUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_PAPER_DOMAINS.some(domain =>
            parsed.hostname.includes(domain)
        );
    } catch {
        return false;
    }
}

export function validatePaperUrls(urls: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const url of urls) {
        if (isValidPaperUrl(url)) {
            valid.push(url);
        } else {
            invalid.push(url);
        }
    }

    return { valid, invalid };
}

// ============================================================================
// Gap Prediction Model Types (#19)
// ============================================================================

export const PredictionModelEnum = z.enum(["lstm", "transformer", "xgboost", "random_forest"]);
export type PredictionModel = z.infer<typeof PredictionModelEnum>;

export const PredictionTimeframeEnum = z.enum(["1_year", "2_years", "5_years", "10_years"]);
export type PredictionTimeframe = z.infer<typeof PredictionTimeframeEnum>;

export const GapPredictionSchema = z.object({
    predictedGap: z.string(),
    confidence: z.number().min(0).max(1),
    timeframe: PredictionTimeframeEnum,
    supportingEvidence: z.array(z.string()),
    citationTrends: z.array(z.string()),
    relatedWork: z.array(z.string()),
    riskFactors: z.array(z.string())
});
export type GapPrediction = z.infer<typeof GapPredictionSchema>;

export const PredictionModelConfigSchema = z.object({
    modelType: PredictionModelEnum,
    historicalDataYears: z.number().min(1).max(20),
    includeCitationTrajectories: z.boolean(),
    minCitations: z.number().optional(),
    topics: z.array(z.string()).optional()
});
export type PredictionModelConfig = z.infer<typeof PredictionModelConfigSchema>;

// ============================================================================
// Citation Types for Formatting Upgrade
// ============================================================================

export const CitationStyleEnum = z.enum(["apa", "mla", "chicago", "ieee", "bibtex", "nature", "cell"]);
export type CitationStyle = z.infer<typeof CitationStyleEnum>;

export const CitationSchema = z.object({
    id: z.string(),
    authors: z.array(z.string()),
    title: z.string(),
    venue: z.string().optional(),
    year: z.number(),
    url: z.string().optional(),
    doi: z.string().optional(),
    volume: z.string().optional(),
    issue: z.string().optional(),
    pages: z.string().optional(),
    publisher: z.string().optional()
});
export type Citation = z.infer<typeof CitationSchema>;

export const FormattedCitationSchema = z.object({
    citation: CitationSchema,
    formattedText: z.string(),
    style: CitationStyleEnum
});
export type FormattedCitation = z.infer<typeof FormattedCitationSchema>;

// ============================================================================
// Research Matching Types (#21)
// ============================================================================

export const ResearcherProfileSchema = z.object({
    id: z.string(),
    name: z.string(),
    institution: z.string().optional(),
    email: z.string().optional(),
    publicationHistory: z.array(z.string()),
    expertise: z.array(z.string()),
    hIndex: z.number().optional(),
    citationCount: z.number().optional(),
    recentPapers: z.array(z.string()).optional()
});
export type ResearcherProfile = z.infer<typeof ResearcherProfileSchema>;

export const ResearchMatchSchema = z.object({
    researcher: ResearcherProfileSchema,
    gap: GapSchema,
    matchScore: z.number().min(0).max(1),
    relevanceReason: z.string(),
    collaborationPotential: z.enum(["high", "medium", "low"])
});
export type ResearchMatch = z.infer<typeof ResearchMatchSchema>;

// ============================================================================
// Grant Proposal Types (#22)
// ============================================================================

export const GrantAgencyEnum = z.enum(["nsf", "nih", "erc", "darpa", "industry"]);
export type GrantAgency = z.infer<typeof GrantAgencyEnum>;

export const GrantProposalSchema = z.object({
    title: z.string(),
    abstract: z.string(),
    specificAims: z.array(z.string()),
    significance: z.string(),
    innovation: z.string(),
    approach: z.string(),
    timeline: z.string(),
    budget: z.string().optional(),
    teamQualifications: z.string().optional(),
    agency: GrantAgencyEnum
});
export type GrantProposal = z.infer<typeof GrantProposalSchema>;

// ============================================================================
// Multi-Modal Analysis Types (#23)
// ============================================================================

export const FigureAnalysisSchema = z.object({
    figureId: z.string(),
    description: z.string(),
    keyFindings: z.array(z.string()),
    limitations: z.array(z.string()),
    extractedData: z.record(z.string(), z.any()).optional()
});
export type FigureAnalysis = z.infer<typeof FigureAnalysisSchema>;

export const TableAnalysisSchema = z.object({
    tableId: z.string(),
    description: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.string()),
    keyInsights: z.array(z.string()),
    dataQuality: z.enum(["excellent", "good", "fair", "poor"])
});
export type TableAnalysis = z.infer<typeof TableAnalysisSchema>;

export const EquationAnalysisSchema = z.object({
    equationId: z.string(),
    latex: z.string(),
    description: z.string(),
    variables: z.record(z.string(), z.string()),
    limitations: z.array(z.string()).optional()
});
export type EquationAnalysis = z.infer<typeof EquationAnalysisSchema>;

export const MultiModalAnalysisSchema = z.object({
    figures: z.array(FigureAnalysisSchema),
    tables: z.array(TableAnalysisSchema),
    equations: z.array(EquationAnalysisSchema),
    summary: z.string()
});
export type MultiModalAnalysis = z.infer<typeof MultiModalAnalysisSchema>;

// ============================================================================
// Agentic Research Assistant Types (#24)
// ============================================================================

export const AgentActionEnum = z.enum(["search", "crawl", "analyze", "compare", "suggest", "iterate", "synthesize"]);
export type AgentAction = z.infer<typeof AgentActionEnum>;

export const AgentStateSchema = z.object({
    currentTopic: z.string(),
    completedActions: z.array(z.object({
        action: AgentActionEnum,
        result: z.string(),
        timestamp: z.string()
    })),
    gatheredPapers: z.array(z.string()),
    identifiedGaps: z.array(z.string()),
    recommendations: z.array(z.string()),
    isComplete: z.boolean()
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentTaskSchema = z.object({
    id: z.string(),
    topic: z.string(),
    maxIterations: z.number().min(1).max(20),
    includeCrawl: z.boolean(),
    includeAnalysis: z.boolean(),
    includeComparison: z.boolean()
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const AgentResultSchema = z.object({
    taskId: z.string(),
    finalReport: z.string(),
    papersFound: z.array(z.string()),
    gapsIdentified: z.array(z.string()),
    suggestedNextSteps: z.array(z.string()),
    iterations: z.number()
});
export type AgentResult = z.infer<typeof AgentResultSchema>;
