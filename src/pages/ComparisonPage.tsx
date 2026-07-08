import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    ArrowLeft,
    Sparkles,
    Zap,
    Target,
    Combine,
    Rocket,
    FileText
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { compareMultipleGaps } from "@/lib/api"


export function ComparisonPage() {
    const navigate = useNavigate()
    const [selectedGaps, setSelectedGaps] = useState<any[]>([])
    const [analysis, setAnalysis] = useState<string>("")
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const stored = localStorage.getItem('compare_gaps')
        if (stored) {
            const gaps = JSON.parse(stored)
            setSelectedGaps(gaps)
            performAnalysis(gaps)
        } else {
            navigate('/explore')
        }
    }, [navigate])

    const performAnalysis = async (gaps: any[]) => {
        setIsLoading(true)
        try {
            const res = await compareMultipleGaps(gaps)
            setAnalysis(res)
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                <Link to="/explore" className="inline-flex items-center gap-2 text-sm text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] mb-8 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Explore
                </Link>

                <div className="mb-12">
                    <div className="section-number mb-4">WORKSPACE</div>
                    <h1 className="heading-section mb-4">
                        Comparative
                        <br />
                        <span className="gradient-text">Research Synthesis</span>
                    </h1>
                    <p className="text-lg text-[rgb(var(--text-secondary))] max-w-2xl">
                        Synthesizing {selectedGaps.length} research opportunities to identify synergies,
                        shared bottlenecks, and joint research directions.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel: Selected Gaps */}
                    <div className="lg:col-span-1 space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-[rgb(var(--text-secondary))] mb-4 flex items-center gap-2">
                            <Target className="h-4 w-4" /> Selected Objects
                        </h2>
                        {selectedGaps.map((gap, i) => (
                            <motion.div
                                key={gap.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                            >
                                <Card className="border-[rgb(255 255 255 / 0.08)] hover:border-[rgb(249 115 22 / 0.3)] transition-colors">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant={gap.type} className="text-[10px] uppercase">{gap.type}</Badge>
                                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-red-500 bg-red-500/5 border-none">{gap.impactScore} Impact</Badge>
                                        </div>
                                        <h3 className="text-sm font-bold leading-tight mb-2">{gap.problem}</h3>
                                        <p className="text-[10px] text-[rgb(var(--text-secondary))] italic truncate">From: {gap.paper}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>

                    {/* Right Panel: Synthesis AI Analysis */}
                    <div className="lg:col-span-2">
                        <Card className="h-full border-[rgb(249 115 22 / 0.2)] shadow-xl shadow-[rgb(249 115 22 / 0.05)] overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-[rgb(249 115 22 / 0.1)] to-[rgb(245 158 11 / 0.1)] border-b border-[rgb(255 255 255 / 0.08)]">
                                <CardTitle className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-[rgb(251 146 60)]" />
                                        AI Synthesis Report
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-2 border-dashed"
                                            onClick={() => {
                                                const blob = new Blob([analysis], { type: 'text/markdown' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'research-synthesis.md';
                                                a.click();
                                            }}
                                        >
                                            <FileText className="h-4 w-4" /> Export MD
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-2 border-dashed text-blue-600 border-blue-200"
                                            onClick={() => {
                                                const latex = `\\section{Research Synthesis}\n${analysis.replace(/#/g, '\\section').replace(/-/g, '\\item')}`;
                                                const blob = new Blob([latex], { type: 'text/plain' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'synthesis.tex';
                                                a.click();
                                            }}
                                        >
                                            <Rocket className="h-4 w-4" /> Export LaTeX
                                        </Button>
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-8">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <div className="relative">
                                            <div className="h-16 w-16 border-4 border-[rgb(249 115 22 / 0.2)] rounded-full" />
                                            <div className="absolute inset-0 h-16 w-16 border-4 border-[rgb(249 115 22)] border-t-transparent rounded-full animate-spin" />
                                            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-[rgb(251 146 60)] animate-pulse" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-bold text-lg mb-1">Synthesizing Context...</p>
                                            <p className="text-[rgb(var(--text-secondary))] text-sm">Identifying synergies across {selectedGaps.length} papers</p>
                                        </div>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-p:text-[rgb(var(--text-secondary))] prose-p:leading-relaxed"
                                    >
                                        <AnalysisMarkdown content={analysis} />
                                    </motion.div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Integration Strategy */}
                {!isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        <StrategyCard
                            icon={<Zap className="h-5 w-5 text-yellow-500" />}
                            title="Synergy Factor"
                            description="AI identified a 75% overlap in data limitations, suggesting a unified benchmark approach."
                        />
                        <StrategyCard
                            icon={<Combine className="h-5 w-5 text-blue-500" />}
                            title="Joint Direction"
                            description="A cross-modal evaluation framework could address evaluation gaps in both papers."
                        />
                        <StrategyCard
                            icon={<Rocket className="h-5 w-5 text-emerald-500" />}
                            title="Pilot Scale-up"
                            description="Recommended start: A 4-week feasibility study on shared dataset constraints."
                        />
                    </motion.div>
                )}
            </div>
        </div>
    )
}

function AnalysisMarkdown({ content }: { content: string }) {
    // Simple markdown renderer for the analysis
    return (
        <div className="whitespace-pre-wrap font-sans">
            {content.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold mt-8 mb-4">{line.replace('# ', '')}</h1>
                if (line.startsWith('## ')) return <h2 key={i} className="text-2xl font-bold mt-6 mb-3">{line.replace('## ', '')}</h2>
                if (line.startsWith('### ')) return <h3 key={i} className="text-xl font-bold mt-4 mb-2">{line.replace('### ', '')}</h3>
                if (line.startsWith('- ')) return <li key={i} className="ml-4 mb-1 list-disc text-[rgb(var(--text-secondary))]">{line.replace('- ', '')}</li>
                return <p key={i} className="mb-4 text-[rgb(var(--text-secondary))]">{line}</p>
            })}
        </div>
    )
}

function StrategyCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
    return (
        <Card className="bg-[rgb(255 255 255 / 0.04)] border-dashed border-[rgb(255 255 255 / 0.08)] group hover:bg-[hsl(var(--brand-primary))]/5 transition-colors">
            <CardContent className="p-6">
                <div className="mb-4 p-2 rounded-lg bg-[rgb(var(--glass-bg))] border border-[rgb(255 255 255 / 0.08)] w-fit group-hover:bg-[rgb(249 115 22 / 0.1)] group-hover:border-[rgb(249 115 22)]/20 transition-colors">
                    {icon}
                </div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-xs text-[rgb(var(--text-secondary))] leading-relaxed">{description}</p>
            </CardContent>
        </Card>
    )
}
