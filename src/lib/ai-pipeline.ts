// Enhanced AI Pipeline Service for GapMiner (Stub Implementation)
// Uses localStorage instead of Firebase for client-side compatibility

// ============================================
// TYPES
// ============================================

export type ProcessingStatus = "queued" | "processing" | "completed" | "failed"

// Stub Timestamp class to replace Firebase Timestamp
class Timestamp {
    private _seconds: number
    private _nanoseconds: number

    constructor(seconds: number, nanoseconds: number) {
        this._seconds = seconds
        this._nanoseconds = nanoseconds
    }

    static now(): Timestamp {
        const now = Date.now()
        return new Timestamp(Math.floor(now / 1000), (now % 1000) * 1000000)
    }

    static fromDate(date: Date): Timestamp {
        const seconds = Math.floor(date.getTime() / 1000)
        const nanoseconds = (date.getTime() % 1000) * 1000000
        return new Timestamp(seconds, nanoseconds)
    }

    toDate(): Date {
        return new Date(this._seconds * 1000 + this._nanoseconds / 1000000)
    }

    toMillis(): number {
        return this._seconds * 1000 + this._nanoseconds / 1000000
    }

    toString(): string {
        return this.toDate().toISOString()
    }
}

export interface BatchJob {
    id?: string
    userId: string
    teamId?: string
    type: "gap_extraction" | "summarization" | "citation_analysis" | "trend_analysis"
    status: ProcessingStatus
    progress: number
    totalItems: number
    completedItems: number
    failedItems: number
    inputData: BatchInput
    outputData?: BatchOutput
    error?: string
    priority: "low" | "normal" | "high"
    createdAt: Timestamp
    startedAt?: Timestamp
    completedAt?: Timestamp
}

export interface BatchInput {
    paperIds?: string[]
    searchQuery?: string
    collectionId?: string
    options?: Record<string, any>
}

export interface BatchOutput {
    results: any[]
    summary?: string
    insights?: AIInsight[]
}

export interface AIInsight {
    id: string
    type: "gap" | "trend" | "recommendation" | "connection"
    title: string
    description: string
    confidence: number
    relatedPapers: string[]
    metadata?: Record<string, any>
}

export interface SmartRecommendation {
    id?: string
    userId: string
    type: "paper" | "gap" | "topic" | "methodology"
    title: string
    description: string
    score: number
    reasoning: string
    dismissed: boolean
    actionedAt?: Timestamp
    createdAt: Timestamp
}

export interface TrendPrediction {
    id?: string
    topic: string
    currentInterest: number
    predictedGrowth: number
    confidence: number
    timeframe: "3m" | "6m" | "1y"
    supportingEvidence: string[]
    createdAt: Timestamp
}

// Storage keys
const BATCH_JOBS_KEY = "gapminer_batch_jobs"
const RECOMMENDATIONS_KEY = "gapminer_recommendations"

// ============================================
// STORAGE HELPERS
// ============================================

function getStorageItem<T>(key: string): T[] {
    if (typeof window === "undefined") return []
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
}

function setStorageItem<T>(key: string, value: T[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(key, JSON.stringify(value))
}

function generateId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============================================
// BATCH PROCESSING
// ============================================

export async function createBatchJob(
    userId: string,
    type: BatchJob["type"],
    inputData: BatchInput,
    priority: BatchJob["priority"] = "normal",
    teamId?: string
): Promise<string> {
    const job: BatchJob = {
        id: generateId(),
        userId,
        teamId,
        type,
        status: "queued",
        progress: 0,
        totalItems: inputData.paperIds?.length || 10,
        completedItems: 0,
        failedItems: 0,
        inputData,
        priority,
        createdAt: Timestamp.now(),
    }

    const jobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    jobs.push(job)
    setStorageItem(BATCH_JOBS_KEY, jobs)

    // Simulate processing
    setTimeout(() => processJob(job.id!), 100)

    return job.id!
}

export async function getBatchJob(jobId: string): Promise<BatchJob | null> {
    const jobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    const job = jobs.find(j => j.id === jobId)
    return job || null
}

export async function getUserBatchJobs(
    userId: string,
    limitCount: number = 20
): Promise<BatchJob[]> {
    const jobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    return jobs
        .filter(j => j.userId === userId)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        .slice(0, limitCount)
}

export async function cancelBatchJob(jobId: string): Promise<void> {
    const jobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    const index = jobs.findIndex(j => j.id === jobId)
    if (index !== -1) {
        jobs[index].status = "failed"
        jobs[index].error = "Cancelled by user"
        setStorageItem(BATCH_JOBS_KEY, jobs)
    }
}

// Simulated job processing
async function processJob(jobId: string): Promise<void> {
    const jobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    const jobIndex = jobs.findIndex(j => j.id === jobId)
    if (jobIndex === -1) return

    const job = jobs[jobIndex]
    if (job.status !== "queued") return

    job.status = "processing"
    job.startedAt = Timestamp.now()
    setStorageItem(BATCH_JOBS_KEY, jobs)

    // Simulate processing with progress updates
    const totalItems = job.totalItems || 10
    for (let i = 1; i <= totalItems; i++) {
        await new Promise(resolve => setTimeout(resolve, 100))

        job.progress = Math.round((i / totalItems) * 100)
        job.completedItems = i

        const currentJobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
        const currentIndex = currentJobs.findIndex(j => j.id === jobId)
        if (currentIndex !== -1) {
            currentJobs[currentIndex] = job
            setStorageItem(BATCH_JOBS_KEY, currentJobs)
        }
    }

    // Generate results
    const results = generateMockResults(job.type, totalItems)

    job.status = "completed"
    job.progress = 100
    job.completedAt = Timestamp.now()
    job.outputData = {
        results,
        summary: `Processed ${totalItems} items successfully`,
        insights: generateMockInsights(job.type),
    }

    const finalJobs = getStorageItem<BatchJob>(BATCH_JOBS_KEY)
    const finalIndex = finalJobs.findIndex(j => j.id === jobId)
    if (finalIndex !== -1) {
        finalJobs[finalIndex] = job
        setStorageItem(BATCH_JOBS_KEY, finalJobs)
    }
}

function generateMockResults(type: BatchJob["type"], count: number): any[] {
    const results: any[] = []
    for (let i = 0; i < count; i++) {
        switch (type) {
            case "gap_extraction":
                results.push({
                    paperId: `paper-${i}`,
                    gaps: [
                        { id: `gap-${i}-1`, title: "Methodology gap", severity: Math.random() },
                        { id: `gap-${i}-2`, title: "Data limitation", severity: Math.random() },
                    ],
                })
                break
            case "summarization":
                results.push({
                    paperId: `paper-${i}`,
                    summary: "AI-generated summary of the paper's key findings and contributions...",
                    keyPoints: ["Point 1", "Point 2", "Point 3"],
                })
                break
            case "citation_analysis":
                results.push({
                    paperId: `paper-${i}`,
                    citationCount: Math.floor(Math.random() * 100),
                    influenceScore: Math.random(),
                    connectedPapers: [`paper-${i + 1}`, `paper-${i + 2}`],
                })
                break
            case "trend_analysis":
                results.push({
                    topic: `Topic ${i}`,
                    growth: Math.random() * 2 - 0.5,
                    papers: Math.floor(Math.random() * 1000),
                })
                break
        }
    }
    return results
}

function generateMockInsights(_type: BatchJob["type"]): AIInsight[] {
    return [
        {
            id: "insight-1",
            type: "gap",
            title: "Cross-domain methodology opportunity",
            description: "Multiple papers could benefit from applying techniques from adjacent fields.",
            confidence: 0.85,
            relatedPapers: ["paper-1", "paper-2"],
        },
        {
            id: "insight-2",
            type: "recommendation",
            title: "High-impact research direction",
            description: "Combining approaches from recent papers could yield breakthrough results.",
            confidence: 0.72,
            relatedPapers: ["paper-3"],
        },
    ]
}

// ============================================
// SMART RECOMMENDATIONS
// ============================================

export async function getRecommendations(
    userId: string,
    limitCount: number = 10
): Promise<SmartRecommendation[]> {
    const recommendations = getStorageItem<SmartRecommendation>(RECOMMENDATIONS_KEY)
    return recommendations
        .filter(r => r.userId === userId && !r.dismissed)
        .sort((a, b) => b.score - a.score)
        .slice(0, limitCount)
}

export async function createRecommendation(
    userId: string,
    type: SmartRecommendation["type"],
    title: string,
    description: string,
    score: number,
    reasoning: string
): Promise<string> {
    const recommendation: SmartRecommendation = {
        id: generateId(),
        userId,
        type,
        title,
        description,
        score,
        reasoning,
        dismissed: false,
        createdAt: Timestamp.now(),
    }

    const recommendations = getStorageItem<SmartRecommendation>(RECOMMENDATIONS_KEY)
    recommendations.push(recommendation)
    setStorageItem(RECOMMENDATIONS_KEY, recommendations)

    return recommendation.id!
}

export async function dismissRecommendation(recommendationId: string): Promise<void> {
    const recommendations = getStorageItem<SmartRecommendation>(RECOMMENDATIONS_KEY)
    const index = recommendations.findIndex(r => r.id === recommendationId)
    if (index !== -1) {
        recommendations[index].dismissed = true
        setStorageItem(RECOMMENDATIONS_KEY, recommendations)
    }
}

export async function actionRecommendation(recommendationId: string): Promise<void> {
    const recommendations = getStorageItem<SmartRecommendation>(RECOMMENDATIONS_KEY)
    const index = recommendations.findIndex(r => r.id === recommendationId)
    if (index !== -1) {
        recommendations[index].actionedAt = Timestamp.now()
        setStorageItem(RECOMMENDATIONS_KEY, recommendations)
    }
}

export async function getUserRecommendations(userId: string): Promise<SmartRecommendation[]> {
    return getRecommendations(userId)
}

export async function generateRecommendations(
    userId: string,
    _papers: any[],
    _interests: string[]
): Promise<SmartRecommendation[]> {
    await generateRecommendationsForUser(userId)
    return getRecommendations(userId)
}

export async function generateRecommendationsForUser(userId: string): Promise<void> {
    // Generate mock recommendations based on user's research interests
    const mockRecommendations: Omit<SmartRecommendation, "id" | "createdAt">[] = [
        {
            userId,
            type: "paper",
            title: "Recent breakthrough in transformer efficiency",
            description: "A new paper proposes a method that could reduce computation by 40%.",
            score: 0.92,
            reasoning: "Matches your interest in efficiency improvements",
            dismissed: false,
        },
        {
            userId,
            type: "topic",
            title: "Emerging: Multimodal reasoning",
            description: "Cross-modal understanding is gaining traction with 5x growth in citations.",
            score: 0.85,
            reasoning: "Adjacent to your current research on vision-language models",
            dismissed: false,
        },
        {
            userId,
            type: "gap",
            title: "Dataset bias in medical imaging",
            description: "Limited diversity in training data identified across 12 papers.",
            score: 0.78,
            reasoning: "High-impact opportunity in your field",
            dismissed: false,
        },
    ]

    for (const rec of mockRecommendations) {
        await createRecommendation(
            rec.userId,
            rec.type,
            rec.title,
            rec.description,
            rec.score,
            rec.reasoning
        )
    }
}

// ============================================
// TREND PREDICTIONS
// ============================================

export async function getTrendPredictions(
    topics: string[],
    timeframe: TrendPrediction["timeframe"] = "6m"
): Promise<TrendPrediction[]> {
    // Generate mock trend predictions
    return topics.map(topic => ({
        id: generateId(),
        topic,
        currentInterest: Math.random() * 100,
        predictedGrowth: (Math.random() * 2 - 0.5) * 100,
        confidence: 0.6 + Math.random() * 0.35,
        timeframe,
        supportingEvidence: [
            "Citation velocity increasing",
            "Multiple papers in recent months",
            "Industry adoption growing",
        ],
        createdAt: Timestamp.now(),
    }))
}

export async function predictTopicTrend(
    topic: string,
    timeframe: TrendPrediction["timeframe"] = "6m"
): Promise<TrendPrediction> {
    const predictions = await getTrendPredictions([topic], timeframe)
    return predictions[0]
}
