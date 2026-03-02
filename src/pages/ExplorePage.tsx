import { useState, useMemo, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    Search,
    ExternalLink,
    SlidersHorizontal,
    X,
    Database,
    Cpu,
    BarChart3,
    FlaskConical,
    BrainCircuit,
    Globe,
    FileJson,
    FileText,
    AlertCircle,
    Zap,
    MessageSquare,
    Rocket,
    Navigation2,
    ShieldAlert,
    Users2,
    BarChart,
    Sparkles,
    Loader2,
    Ban,
    Anchor,
    ListChecks,
    DollarSign,
    Ghost
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getCrawlResults } from "@/lib/firestore"
import { useAuth } from "@/context/AuthContext"
import PrimeHero from "@/components/layout/PrimeHero"
import {
    explainUnsolved,
    generateStartupIdea,
    generateResearchQuestions,
    generateResearchProposal,
    generateSolvingRoadmap,
    generateRedTeamAnalysis,
    generateCollaboratorProfile,
    predictImpact,
    semanticSearchGaps,
    analyzeFeasibility,
    generateSixMonthPlan,
    crossDomainCheck,
    analyzeFundingSignal,
    analyzeCommunityAvoidance
} from "@/lib/api"
import { exportToMarkdown, exportToJSON } from "@/lib/export"
import { AnalysisModal } from "@/components/AnalysisModal"

const typeConfig = {
    data: {
        label: "Data",
        icon: Database,
        color: "tag-data",
    },
    compute: {
        label: "Compute",
        icon: Cpu,
        color: "tag-compute",
    },
    evaluation: {
        label: "Evaluation",
        icon: BarChart3,
        color: "tag-evaluation",
    },
    methodology: {
        label: "Methodology",
        icon: FlaskConical,
        color: "tag-methodology",
    },
    theory: {
        label: "Theory",
        icon: BrainCircuit,
        color: "tag-theory",
    },
    deployment: {
        label: "Deployment",
        icon: Globe,
        color: "tag-methodology",
    }
}

const venues = ["All", "NeurIPS", "ACL", "ICML", "ICLR", "arXiv"]

export function ExplorePage() {
    const { user } = useAuth()
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
    const [selectedVenue, setSelectedVenue] = useState("All")
    const [showFilters, setShowFilters] = useState(false)
    const [results, setResults] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [modalData, setModalData] = useState<{ isOpen: boolean, title: string, content: any }>({
        isOpen: false,
        title: "",
        content: ""
    })
    const [isSemanticMode, setIsSemanticMode] = useState(false)
    const [semanticIds, setSemanticIds] = useState<string[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [comparisonGaps, setComparisonGaps] = useState<any[]>([])

    useEffect(() => {
        async function load() {
            if (!user) return
            try {
                const data = await getCrawlResults(user.id)
                const allGaps = data.flatMap(r => r.gaps.map(g => ({
                    ...g,
                    paper: r.title,
                    url: r.url,
                    venue: r.venue || "arXiv",
                    date: (r as any).createdAt?.toDate()?.toISOString().split('T')[0] || "2024-01-01"
                })))
                setResults(allGaps)
            } catch (error) {
                console.error("Failed to load gaps:", error)
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [user])

    const filteredGaps = useMemo(() => {
        return results.filter(gap => {
            if (isSemanticMode && semanticIds.length > 0) {
                return semanticIds.includes(gap.id)
            }
            const matchesSearch = gap.problem.toLowerCase().includes(searchQuery.toLowerCase()) ||
                gap.paper.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesType = selectedTypes.size === 0 || selectedTypes.has(gap.type)
            const matchesVenue = selectedVenue === "All" || gap.venue === selectedVenue
            return matchesSearch && matchesType && matchesVenue
        })
    }, [results, searchQuery, selectedTypes, selectedVenue, isSemanticMode, semanticIds])

    const handleSearch = async () => {
        if (isSemanticMode && searchQuery.trim()) {
            setIsSearching(true)
            try {
                const ids = await semanticSearchGaps(searchQuery, results)
                setSemanticIds(ids)
            } catch (err) {
                console.error(err)
            } finally {
                setIsSearching(false)
            }
        }
    }

    useEffect(() => {
        if (!isSemanticMode) {
            setSemanticIds([])
        }
    }, [isSemanticMode])

    const toggleCompare = (gap: any) => {
        setComparisonGaps(prev => {
            const exists = prev.find(g => g.id === gap.id)
            if (exists) return prev.filter(g => g.id !== gap.id)
            if (prev.length >= 3) return prev // Limit to 3 for now
            return [...prev, gap]
        })
    }

    const toggleType = (type: string) => {
        const newTypes = new Set(selectedTypes)
        if (newTypes.has(type)) newTypes.delete(type)
        else newTypes.add(type)
        setSelectedTypes(newTypes)
    }

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                {/* PRIME Header */}
                <PrimeHero />

                {/* Search and Filter Bar */}
                <div className="mb-8 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="explore-search-input"
                            placeholder={isSemanticMode ? "Describe the concept you're looking for..." : "Search gaps, papers, or keywords..."}
                            className="pl-10 h-12 bg-muted/30 border-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className={cn(
                                "h-12 px-6 gap-2 border-dashed",
                                isSemanticMode ? "bg-primary/10 border-primary text-primary" : ""
                            )}
                            onClick={() => setIsSemanticMode(!isSemanticMode)}
                        >
                            <Sparkles className={cn("h-4 w-4", isSemanticMode ? "fill-current" : "")} />
                            AI Semantic
                        </Button>
                        <Button
                            id="explore-filters-toggle"
                            variant="outline"
                            className={cn("h-12 px-6 gap-2", showFilters && "bg-muted")}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            Filters
                            {selectedTypes.size > 0 && (
                                <Badge className="ml-1 h-5 min-w-5 px-1 bg-primary text-primary-foreground">
                                    {selectedTypes.size}
                                </Badge>
                            )}
                        </Button>
                        <select
                            id="explore-venue-selector"
                            className="h-12 px-4 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            value={selectedVenue}
                            onChange={(e) => setSelectedVenue(e.target.value)}
                        >
                            {venues.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                </div>

                {/* Expanded Filters */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mb-8"
                        >
                            <Card className="bg-muted/10 border-dashed">
                                <CardContent className="pt-6">
                                    <div className="flex flex-wrap gap-3">
                                        {Object.entries(typeConfig).map(([id, config]) => {
                                            const Icon = config.icon
                                            const isSelected = selectedTypes.has(id)
                                            return (
                                                <button
                                                    id={`filter-type-${id}`}
                                                    key={id}
                                                    onClick={() => toggleType(id)}
                                                    className={cn(
                                                        "flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition-all",
                                                        isSelected
                                                            ? "bg-primary border-primary text-primary-foreground"
                                                            : "bg-background border-border text-muted-foreground hover:border-primary"
                                                    )}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                    {config.label}
                                                </button>
                                            )
                                        })}
                                        {selectedTypes.size > 0 && (
                                            <Button
                                                id="clear-all-filters"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedTypes(new Set())}
                                                className="text-xs text-red-500 hover:text-red-600"
                                            >
                                                <X className="h-3 w-3 mr-1" />
                                                Clear all
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gaps Grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-[280px] rounded-xl bg-muted/20 animate-pulse" />
                        ))}
                    </div>
                ) : filteredGaps.length === 0 ? (
                    <div className="text-center py-20 px-4 bg-muted/10 rounded-2xl border-2 border-dashed border-border">
                        <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                            <Search className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No matching gaps found</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                            Try adjusting your filters or search query to find more research opportunities.
                        </p>
                        <Button
                            id="no-results-clear-filters"
                            variant="outline"
                            onClick={() => {
                                setSearchQuery("")
                                setSelectedTypes(new Set())
                                setSelectedVenue("All")
                            }}
                        >
                            Clear all filters
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredGaps.map((gap, i) => {
                            const config = (typeConfig as any)[gap.type] || typeConfig.data
                            const Icon = config.icon
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Card className="card-hover h-full flex flex-col group overflow-hidden border-border">
                                        <CardContent className="p-6 flex flex-col h-full">
                                            {/* Top Row: Type and Metadata */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-lg bg-primary/10">
                                                        <Icon className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <Badge variant={gap.type} className="uppercase font-bold tracking-tighter text-[10px]">
                                                        {gap.type}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {gap.impactScore && (
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-bold border-none capitalize px-1.5 py-0.5",
                                                            gap.impactScore === 'high' ? "bg-red-500/10 text-red-600" :
                                                                gap.impactScore === 'medium' ? "bg-blue-500/10 text-blue-600" :
                                                                    "bg-slate-500/10 text-slate-600"
                                                        )}>
                                                            {gap.impactScore} IMPACT
                                                        </Badge>
                                                    )}
                                                    {gap.difficulty && (
                                                        <Badge variant="outline" className="text-[9px] border-dashed">
                                                            {gap.difficulty} DIFF
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Problem Title */}
                                            <h3 className="text-lg font-bold mb-4 line-clamp-3 leading-tight group-hover:text-primary transition-colors">
                                                {gap.problem}
                                            </h3>

                                            {/* Meta Research Fields */}
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {gap.failures && gap.failures.length > 0 && (
                                                    <Badge variant="outline" className="text-[9px] bg-red-500/5 text-red-600 border-red-200">
                                                        <Ban className="h-2.5 w-2.5 mr-1" /> Negative Results
                                                    </Badge>
                                                )}
                                                {gap.assumptions && gap.assumptions.length > 0 && (
                                                    <Badge variant="outline" className="text-[9px] bg-yellow-500/5 text-yellow-600 border-yellow-200">
                                                        <Anchor className="h-2.5 w-2.5 mr-1" /> Assumption Found
                                                    </Badge>
                                                )}
                                                {gap.datasetGaps && gap.datasetGaps.length > 0 && (
                                                    <Badge variant="outline" className="text-[9px] bg-blue-500/5 text-blue-600 border-blue-200">
                                                        <Database className="h-2.5 w-2.5 mr-1" /> Dataset Missing
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Source Paper */}
                                            <div className="mt-auto pt-4 flex flex-col gap-3">
                                                <div className="p-3 bg-muted/30 rounded-lg">
                                                    <p className="text-[10px] text-muted-foreground mb-1 flex items-center justify-between">
                                                        <span>Identified in:</span>
                                                        <span className="font-mono bg-background px-1 rounded border border-border">{gap.venue}</span>
                                                    </p>
                                                    <p className="text-xs font-medium line-clamp-1">{gap.paper}</p>
                                                    <a
                                                        id={`view-paper-${i}`}
                                                        href={gap.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-1"
                                                    >
                                                        View Paper <ExternalLink className="h-2 w-2" />
                                                    </a>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex flex-wrap gap-2 pt-2">
                                                    <div className="w-full flex gap-2">
                                                        <Button
                                                            id={`gap-context-${i}`}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="flex-1 h-8 text-[10px] gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 border border-purple-200"
                                                            onClick={async () => {
                                                                const res = await explainUnsolved(gap.problem)
                                                                let content = res
                                                                if (gap.assumptions?.length) content += `\n\n### Hidden Assumptions\n${gap.assumptions.map((a: string) => `- ${a}`).join("\n")}`
                                                                if (gap.failures?.length) content += `\n\n### Failed Approaches (Extraction)\n${gap.failures.map((f: string) => `- ${f}`).join("\n")}`
                                                                setModalData({ isOpen: true, title: "Historical Context", content })
                                                            }}
                                                        >
                                                            <AlertCircle className="h-3.5 w-3.5" />
                                                            Context
                                                        </Button>
                                                        <Button
                                                            id={`gap-idea-${i}`}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="flex-1 h-8 text-[10px] gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 border border-yellow-200"
                                                            onClick={async () => {
                                                                const res = await generateStartupIdea(gap.problem)
                                                                setModalData({
                                                                    isOpen: true,
                                                                    title: "Startup Insight",
                                                                    content: `IDEA:\n${res.idea}\n\nTARGET AUDIENCE:\n${res.audience}\n\nWHY NOW:\n${res.why_now}`
                                                                })
                                                            }}
                                                        >
                                                            <Zap className="h-3.5 w-3.5" />
                                                            Idea
                                                        </Button>
                                                        <Button
                                                            id={`gap-research-${i}`}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="flex-1 h-8 text-[10px] gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 border border-blue-200"
                                                            onClick={async () => {
                                                                const res = await generateResearchQuestions(gap.problem)
                                                                setModalData({ isOpen: true, title: "Research Questions", content: res.join("\n\n") })
                                                            }}
                                                        >
                                                            <MessageSquare className="h-3.5 w-3.5" />
                                                            Research
                                                        </Button>
                                                    </div>

                                                    {/* Meta Tools Submenu */}
                                                    <div className="w-full grid grid-cols-2 gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[9px] gap-1 opacity-70 hover:opacity-100"
                                                            onClick={async () => {
                                                                const res = await analyzeFeasibility(gap.problem)
                                                                setModalData({
                                                                    isOpen: true,
                                                                    title: "Reality Check (2025)",
                                                                    content: `FEASIBILITY: ${res.score}\n\n${res.reason}\n\nMETRICS:\n${Object.entries(res.metrics).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
                                                                })
                                                            }}
                                                        >
                                                            <ListChecks className="h-3 w-3" /> Reality Check
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[9px] gap-1 opacity-70 hover:opacity-100"
                                                            onClick={async () => {
                                                                const res = await generateSixMonthPlan(gap.problem)
                                                                setModalData({
                                                                    isOpen: true,
                                                                    title: "Research Plan (6 Months)",
                                                                    content: res.map(p => `### ${p.months}\n${p.activity}`).join("\n\n")
                                                                })
                                                            }}
                                                        >
                                                            <Rocket className="h-3 w-3" /> 6mo Plan
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[9px] gap-1 opacity-70 hover:opacity-100"
                                                            onClick={async () => {
                                                                const res = await crossDomainCheck(gap.problem)
                                                                setModalData({ isOpen: true, title: "Cross-Domain Transfer", content: res })
                                                            }}
                                                        >
                                                            <Globe className="h-3 w-3" /> Cross-Domain
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[9px] gap-1 opacity-70 hover:opacity-100"
                                                            onClick={async () => {
                                                                const res = await analyzeFundingSignal(gap.problem)
                                                                setModalData({ isOpen: true, title: "Funding Signal", content: `CATEGORY: ${res.category}\n\n${res.justification}` })
                                                            }}
                                                        >
                                                            <DollarSign className="h-3 w-3" /> Funding
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[9px] gap-1 opacity-70 hover:opacity-100"
                                                            onClick={async () => {
                                                                const res = await analyzeCommunityAvoidance(gap.problem)
                                                                setModalData({ isOpen: true, title: "Community Blind Spots", content: res })
                                                            }}
                                                        >
                                                            <Ghost className="h-3 w-3" /> Bias Check
                                                        </Button>
                                                    </div>

                                                    {/* Visionary Tools Row */}
                                                    <div className="flex flex-wrap gap-1.5 w-full mt-1 border-t border-dashed border-border pt-3">
                                                        <Button
                                                            id={`gap-proposal-${i}`}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[8px] gap-1 px-1.5 border-dashed hover:bg-blue-500/10"
                                                            onClick={async () => {
                                                                const res = await generateResearchProposal(gap.problem)
                                                                setModalData({ isOpen: true, title: "Research Proposal Draft", content: `TITLE: ${res.title}\n\nABSTRACT:\n${res.abstract}\n\nMOTIVATION:\n${res.motivation}\n\nMETHODOLOGY:\n${res.methodology}` })
                                                            }}
                                                        >
                                                            <Rocket className="h-2.5 w-2.5" /> Proposal
                                                        </Button>
                                                        <Button
                                                            id={`gap-roadmap-${i}`}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[8px] gap-1 px-1.5 border-dashed hover:bg-emerald-500/10"
                                                            onClick={async () => {
                                                                const res = await generateSolvingRoadmap(gap.problem)
                                                                setModalData({ isOpen: true, title: "Solving Roadmap", content: res.map(p => `${p.phase}:\n- ${p.milestones.join("\n- ")}`).join("\n\n") })
                                                            }}
                                                        >
                                                            <Navigation2 className="h-2.5 w-2.5" /> Roadmap
                                                        </Button>
                                                        <Button
                                                            id={`gap-redteam-${i}`}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[8px] gap-1 px-1.5 border-dashed hover:bg-red-500/10"
                                                            onClick={async () => {
                                                                const res = await generateRedTeamAnalysis(gap.problem)
                                                                setModalData({ isOpen: true, title: "Red Team Analysis", content: res.map(f => `FAILURE: ${f.failure_mode}\nMITIGATION: ${f.mitigation}`).join("\n\n") })
                                                            }}
                                                        >
                                                            <ShieldAlert className="h-2.5 w-2.5" /> Red Team
                                                        </Button>
                                                        <Button
                                                            id={`gap-impact-${i}`}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[8px] gap-1 px-1.5 border-dashed hover:bg-orange-500/10"
                                                            onClick={async () => {
                                                                const res = await predictImpact(gap.problem)
                                                                setModalData({ isOpen: true, title: "Impact Scorecard", content: `HYPE: ${res.hype_score}%\nREALITY: ${res.reality_score}%\nCITATIONS: ${res.predicted_citations}\n\nWHY: ${res.justification}` })
                                                            }}
                                                        >
                                                            <BarChart className="h-2.5 w-2.5" /> Impact
                                                        </Button>
                                                        <Button
                                                            id={`gap-team-${i}`}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[8px] gap-1 px-1.5 border-dashed hover:bg-purple-500/10"
                                                            onClick={async () => {
                                                                const res = await generateCollaboratorProfile(gap.problem)
                                                                setModalData({ isOpen: true, title: "Ideal Team Profile", content: res.map(r => `${r.role}:\n- ${r.expertise}`).join("\n\n") })
                                                            }}
                                                        >
                                                            <Users2 className="h-2.5 w-2.5" /> Team
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={cn(
                                                                "h-7 text-[8px] gap-1 px-1.5 border-solid transition-all",
                                                                comparisonGaps.find(g => g.id === gap.id)
                                                                    ? "bg-primary text-primary-foreground border-primary"
                                                                    : "hover:bg-primary/10 border-border"
                                                            )}
                                                            onClick={() => toggleCompare(gap)}
                                                        >
                                                            <Sparkles className="h-2.5 w-2.5" />
                                                            {comparisonGaps.find(g => g.id === gap.id) ? "Added" : "Compare"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </div>

            <AnalysisModal
                isOpen={modalData.isOpen}
                onOpenChange={(open) => setModalData(prev => ({ ...prev, isOpen: open }))}
                title={modalData.title}
                content={modalData.content}
            />

            {/* Comparison Bar */}
            <AnimatePresence>
                {comparisonGaps.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
                    >
                        <Card className="bg-black/90 text-white border-white/10 backdrop-blur-md px-6 py-4 flex items-center gap-8 shadow-2xl rounded-full">
                            <div className="flex items-center gap-4">
                                <div className="flex -space-x-3">
                                    {comparisonGaps.map((g, i) => (
                                        <div key={i} className="h-8 w-8 rounded-full bg-primary border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                                            {g.type[0].toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                                <div className="text-sm font-medium">
                                    {comparisonGaps.length} gaps selected
                                    <span className="text-white/40 ml-2">(Max 3)</span>
                                </div>
                            </div>
                            <div className="h-4 w-[1px] bg-white/20" />
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-white/60 hover:text-white"
                                    onClick={() => setComparisonGaps([])}
                                >
                                    Clear
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-white text-black hover:bg-white/90 gap-2"
                                    onClick={() => {
                                        // Store in localStorage and navigate
                                        localStorage.setItem('compare_gaps', JSON.stringify(comparisonGaps))
                                        window.location.href = '/compare'
                                    }}
                                >
                                    Analyze Comparison <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
