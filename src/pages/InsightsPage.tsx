import { motion } from "framer-motion"
import {
    Lightbulb,
    TrendingUp,
    Database,
    Cpu,
    BarChart3,
    FlaskConical,
    ArrowRight,
    MessageSquare,
    Sparkles,
    Calendar,
    History,
    FileJson,
    FileText,
    Share2,
    Globe,
    BrainCircuit,
    Zap,
    ScrollText,
    Swords,
    BarChart,
    ArrowUpRight,
    Network,
    ShieldAlert,
    Ghost,
    Loader2
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid"
import { useState, useEffect } from "react"
import { getCrawlResults, type CrawlResult, type Gap } from "@/lib/firestore"
import { useAuth } from "@/context/AuthContext"
import {
    detectRepeatedGaps,
    clusterGapsIntoThemes,
    summarizeStateOfField,
    draftLiteratureReview,
    detectContradictions,
    detectResearchBlindSpots,
    analyzeHistoricalMisses
} from "@/lib/api"
import { exportToMarkdown, exportToJSON } from "@/lib/export"
import { AnalysisModal } from "@/components/AnalysisModal"

interface GapWithSource extends Gap {
    sourceTitle: string
    sourceYear?: string
}

const typeConfig = {
    data: { label: "Data", icon: Database },
    compute: { label: "Compute", icon: Cpu },
    evaluation: { label: "Evaluation", icon: BarChart3 },
    methodology: { label: "Methodology", icon: FlaskConical },
    theory: { label: "Theory", icon: BrainCircuit },
    deployment: { label: "Deployment", icon: Globe }
}

const suggestedQuestions = [
    {
        question: "Which gaps appear across multiple venues?",
        description: "Find problems that researchers from different communities have identified",
        icon: TrendingUp,
    },
    {
        question: "Which problems are now solvable with new techniques?",
        description: "Identify gaps that recent advances might address",
        icon: Sparkles,
    },
    {
        question: "Which gaps are tooling-related?",
        description: "Find opportunities for infrastructure and developer tools",
        icon: FlaskConical,
    },
    {
        question: "What are the most cited unsolved problems?",
        description: "Discover high-impact research directions",
        icon: MessageSquare,
    },
]

export function InsightsPage() {
    const { user } = useAuth()
    const [results, setResults] = useState<CrawlResult[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [repeatedGaps, setRepeatedGaps] = useState<any[]>([])
    const [themes, setThemes] = useState<any[]>([])
    const [contradictions, setContradictions] = useState<any[]>([])
    const [blindSpots, setBlindSpots] = useState<any[]>([])
    const [modalData, setModalData] = useState<{ isOpen: boolean, title: string, content: any }>({
        isOpen: false,
        title: "",
        content: ""
    })

    useEffect(() => {
        async function loadData() {
            if (!user) return
            try {
                const data = await getCrawlResults(user.id)
                setResults(data)

                // Initialize meta analyses if data exists
                if (data.length > 0) {
                    setIsAnalyzing(true)
                    const [dupRes, themeRes, contRes, blindRes] = await Promise.all([
                        detectRepeatedGaps(data),
                        clusterGapsIntoThemes(data.flatMap(r => r.gaps)),
                        detectContradictions(data),
                        detectResearchBlindSpots(data)
                    ])
                    setRepeatedGaps(dupRes)
                    setThemes(themeRes)
                    setContradictions(contRes)
                    setBlindSpots(blindRes)
                    setIsAnalyzing(false)
                }
            } catch (error) {
                console.error("Failed to load insights:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [user])

    // Grouping logic for Timeline
    const gapsByYear: Record<string, GapWithSource[]> = {}
    results.forEach(r => {
        const year = r.year
        if (!year) return
        if (!gapsByYear[year]) gapsByYear[year] = []
        r.gaps.forEach(g => {
            gapsByYear[year].push({ ...g, sourceTitle: r.title, sourceYear: year })
        })
    })
    const sortedYears = Object.keys(gapsByYear).sort((a, b) => b.localeCompare(a))

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                {/* Header */}
                <div className="mb-12">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="section-number mb-4">INSIGHTS</div>
                            <h1 className="heading-section mb-4">
                                Cross-Paper Analysis
                                <br />
                                <span className="gradient-text">& Research Themes</span>
                            </h1>
                            <p className="text-lg text-muted-foreground max-w-2xl">
                                Discover repeating patterns across papers to identify high-impact
                                research directions and unsolved problems that matter.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 bg-emerald-500/5 text-emerald-600 border-emerald-200 hover:bg-emerald-500/10"
                                onClick={() => window.location.href = '/map'}
                            >
                                <Network className="h-4 w-4" />
                                Knowledge Map
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 bg-purple-500/5 text-purple-600 border-purple-200 hover:bg-purple-500/10"
                                onClick={async () => {
                                    const report = await summarizeStateOfField(results)
                                    setModalData({ isOpen: true, title: "State of the Field Report", content: report })
                                }}
                            >
                                <ScrollText className="h-4 w-4" />
                                State of Field
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 bg-blue-500/5 text-blue-600 border-blue-200 hover:bg-blue-500/10"
                                onClick={async () => {
                                    const review = await draftLiteratureReview(results)
                                    setModalData({ isOpen: true, title: "Literature Review Draft", content: review })
                                }}
                            >
                                <Sparkles className="h-4 w-4" />
                                Lit Review Drafter
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 bg-amber-500/5 text-amber-600 border-amber-200 hover:bg-amber-500/10"
                                onClick={async () => {
                                    const res = await analyzeHistoricalMisses(results)
                                    setModalData({ isOpen: true, title: "Historical Misses Analysis", content: res })
                                }}
                            >
                                <History className="h-4 w-4" />
                                Historical Misses
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => exportToMarkdown(results)} className="gap-2">
                                <FileText className="h-4 w-4" />
                                Export MD
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => exportToJSON(results)} className="gap-2">
                                <FileJson className="h-4 w-4" />
                                Export JSON
                            </Button>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground">Analyzing your research library...</p>
                    </div>
                ) : results.length === 0 ? (
                    <section className="mb-16">
                        <Card className="border-dashed py-12 text-center">
                            <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                <History className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2">No data yet</h3>
                            <p className="text-muted-foreground mb-6">Crawl some papers and save them to your library to see insights.</p>
                            <Link to="/crawl">
                                <Button>Start Crawling</Button>
                            </Link>
                        </Card>
                    </section>
                ) : (
                    <>
                        {/* Priority Opportunities */}
                        <section className="mb-16">
                            <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                                <Zap className="h-5 w-5 text-orange-500" />
                                Priority Opportunities (Low-Hanging Fruit)
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {results.flatMap(r => r.gaps.map(g => ({ ...g, paper: r.title })))
                                    .filter(g => g.impactScore === 'high' && (g.difficulty === 'low' || g.difficulty === 'medium'))
                                    .slice(0, 3)
                                    .map((gap, idx) => (
                                        <Card key={idx} className="bg-orange-500/5 border-orange-200 border-dashed">
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between mb-2">
                                                    <Badge className="bg-orange-500 text-white border-none">HIGH IMPACT</Badge>
                                                    <Badge variant="outline" className="text-xs">{gap.difficulty} difficulty</Badge>
                                                </div>
                                                <p className="text-sm font-medium mb-3">{gap.problem}</p>
                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <ArrowUpRight className="h-3 w-3" />
                                                    {gap.paper}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ))}
                            </div>
                        </section>
                        {/* Evolution Timeline */}
                        <section className="mb-16">
                            <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-primary" />
                                Evolution of Research Gaps
                            </h2>
                            <div className="space-y-8 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-border before:h-full">
                                {sortedYears.map((year) => (
                                    <div key={year} className="relative pl-12">
                                        <div className="absolute left-0 top-1 h-8 w-8 rounded-full border-4 border-background bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-primary/20">
                                            {year.slice(-2)}
                                        </div>
                                        <div className="mb-2 flex items-center gap-2">
                                            <h3 className="text-lg font-bold">{year}</h3>
                                            <Badge variant="outline">{gapsByYear[year].length} items</Badge>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {gapsByYear[year].slice(0, 6).map((gap, i) => (
                                                <Card key={i} className="bg-muted/30 border-none">
                                                    <CardContent className="p-3">
                                                        <div className="flex gap-2 items-center mb-2">
                                                            <Badge variant={gap.type as any} className="h-4 text-[9px] px-1 uppercase">{gap.type}</Badge>
                                                        </div>
                                                        <p className="text-xs line-clamp-2 mb-2 font-medium">{gap.problem}</p>
                                                        <p className="text-[10px] text-muted-foreground truncate">from: {gap.sourceTitle}</p>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Repeating Themes */}
                        <section className="mb-16">
                            <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                Extracted Research Themes
                            </h2>
                            {isAnalyzing ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    Clustering gaps into themes...
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {themes.length > 0 ? themes.map((theme, idx) => {
                                        const config = (typeConfig as any)[theme.type] || typeConfig.data
                                        const Icon = config.icon
                                        return (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.1 }}
                                            >
                                                <Card className="card-hover h-full border-primary/20">
                                                    <CardContent className="pt-6">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                                                            <Icon className="h-6 w-6 text-primary" />
                                                        </div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h3 className="font-semibold text-sm">{theme.theme}</h3>
                                                            <Badge className="bg-primary/10 text-primary border-none">{theme.count}</Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {theme.description}
                                                        </p>
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        )
                                    }) : (
                                        <div className="col-span-full py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                                            Not enough data for thematic clustering.
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* Repeating Gaps */}
                        <section className="mb-16">
                            <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                Cross-Paper Repeating Gaps
                            </h2>
                            {isAnalyzing ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    Detecting repeating gaps...
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {repeatedGaps.length > 0 ? repeatedGaps.map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.1 }}
                                        >
                                            <Card className="card-hover">
                                                <CardContent className="py-4">
                                                    <div className="flex items-start gap-4">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono font-bold text-primary">
                                                            #{idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <p className="font-medium">{item.problem}</p>
                                                                <Badge variant="destructive" className="h-5 text-[10px] gap-1">
                                                                    <Share2 className="h-3 w-3" />
                                                                    Seen in {item.count} papers
                                                                </Badge>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {item.sources.map((source: string) => (
                                                                    <Badge key={source} variant="secondary" className="text-[10px] max-w-[200px] truncate">
                                                                        {source}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    )) : (
                                        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                                            No repeating gaps detected across your library yet.
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* Contradiction Tracker */}
                        <section className="mb-16">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="font-semibold text-xl flex items-center gap-2">
                                    <Swords className="h-5 w-5 text-red-500" />
                                    Contradiction Tracker
                                </h2>
                                <Badge variant="outline" className="gap-1.5 py-1">
                                    <BarChart className="h-3 w-3" />
                                    Conflict Analysis Active
                                </Badge>
                            </div>
                            {isAnalyzing ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    Finding conflicting research gaps...
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {contradictions.length > 0 ? contradictions.map((c: any, idx) => (
                                        <Card key={idx} className="border-red-200/50 bg-red-500/5">
                                            <CardContent className="pt-6">
                                                <h3 className="text-sm font-bold text-red-700 mb-2">
                                                    {c.point_of_conflict}
                                                </h3>
                                                <div className="flex flex-col gap-2 text-xs mb-4">
                                                    <div className="p-2 bg-background/50 rounded border border-red-100 italic">
                                                        "Gaps identified in {c.paper_a} contrast with {c.paper_b}."
                                                    </div>
                                                </div>
                                                <div className="p-3 bg-background rounded border border-red-200 shadow-sm">
                                                    <p className="font-semibold text-[10px] text-red-600 uppercase mb-1">Proposed Resolution</p>
                                                    <p className="text-xs">{c.resolution}</p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )) : (
                                        <div className="col-span-full py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                                            No major research contradictions detected so far.
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className="mb-16">
                            <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                                <Ghost className="h-5 w-5 text-purple-500" />
                                Research Blind Spots
                                <Badge variant="outline" className="ml-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20">
                                    Stagnation Zones
                                </Badge>
                            </h2>
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center py-12 bg-muted/20 rounded-lg border border-dashed">
                                    <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-4" />
                                    <p className="text-sm text-muted-foreground italic">Detecting stagnation patterns...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {blindSpots.length > 0 ? blindSpots.map((spot: any, idx) => (
                                        <Card key={idx} className="border-purple-200/50 hover:shadow-lg transition-all group">
                                            <CardContent className="pt-6">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="p-2 bg-purple-100 dark:bg-purple-500/10 rounded-lg text-purple-700 dark:text-purple-400">
                                                        <ShieldAlert className="h-5 w-5" />
                                                    </div>
                                                    <Badge variant={spot.severity === 'high' ? 'destructive' : 'secondary'}>
                                                        {spot.severity.toUpperCase()} SEVERITY
                                                    </Badge>
                                                </div>
                                                <h3 className="font-bold mb-2 group-hover:text-purple-600 transition-colors">
                                                    {spot.zone}
                                                </h3>
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                    {spot.reason}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    )) : (
                                        <div className="col-span-full py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                                            No significant stagnancy detected in this research corpus.
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* Suggested Questions */}
                <section className="mb-16">
                    <h2 className="font-semibold text-xl mb-6 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        Questions You Can Ask
                    </h2>
                    <BentoGrid className="grid-cols-1 md:grid-cols-2">
                        {suggestedQuestions.map((item, idx) => {
                            const Icon = item.icon
                            return (
                                <BentoGridItem
                                    key={idx}
                                    title={item.question}
                                    description={item.description}
                                    icon={<Icon className="h-5 w-5 text-primary" />}
                                    header={
                                        <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10">
                                            <Icon className="h-10 w-10 text-primary" />
                                        </div>
                                    }
                                    className="cursor-pointer"
                                />
                            )
                        })}
                    </BentoGrid>
                </section>

                {/* CTA */}
                <section className="mt-16 text-center">
                    <h2 className="heading-section mb-4">
                        Ready to find your next research direction?
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                        Start by crawling more papers to expand your insight database.
                    </p>
                    <Link to="/crawl">
                        <Button size="lg" className="gap-2">
                            <Lightbulb className="h-5 w-5" />
                            Crawl More Papers
                            <ArrowRight className="h-5 w-5" />
                        </Button>
                    </Link>
                </section>
            </div>

            <AnalysisModal
                isOpen={modalData.isOpen}
                onOpenChange={(open) => setModalData(prev => ({ ...prev, isOpen: open }))}
                title={modalData.title}
                content={modalData.content}
            />
        </div>
    )
}
