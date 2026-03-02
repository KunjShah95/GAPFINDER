// Research Trends Component
// Displays AI-predicted research trends with visualizations

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    TrendingUp,
    TrendingDown,
    ArrowRight,
    Sparkles,
    Clock,
    BarChart3,
    Info,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "./card"
import { Badge } from "./badge"
import { Button } from "./button"
import { getTrendPredictions, type TrendPrediction } from "@/lib/ai-pipeline"

interface ResearchTrendsProps {
    timeframe?: TrendPrediction["timeframe"]
}

export function ResearchTrends({ timeframe = "6m" }: ResearchTrendsProps) {
    const [trends, setTrends] = useState<TrendPrediction[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe)

    useEffect(() => {
        loadTrends()
    }, [selectedTimeframe])

    async function loadTrends() {
        setIsLoading(true)
        try {
            const data = await getTrendPredictions([], selectedTimeframe)
            setTrends(data)
        } catch (error) {
            console.error("Failed to load trends:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const timeframes = [
        { value: "3m" as const, label: "3 months" },
        { value: "6m" as const, label: "6 months" },
        { value: "1y" as const, label: "1 year" },
    ]

    if (isLoading) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="animate-pulse flex gap-4">
                                <div className="h-12 w-12 rounded-lg bg-[hsl(var(--muted))]" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-1/3 rounded bg-[hsl(var(--muted))]" />
                                    <div className="h-3 w-full rounded bg-[hsl(var(--muted))]" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-[hsl(var(--brand-primary))]" />
                        Research Trends
                    </CardTitle>
                    <div className="flex gap-1 p-1 rounded-lg bg-[hsl(var(--muted))]">
                        {timeframes.map(tf => (
                            <button
                                key={tf.value}
                                onClick={() => setSelectedTimeframe(tf.value)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${selectedTimeframe === tf.value
                                        ? "bg-[hsl(var(--card))] shadow-sm"
                                        : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
                                    }`}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {trends.map((trend, idx) => {
                        const isGrowing = trend.predictedGrowth > 0
                        const growthPercent = Math.abs(Math.round(trend.predictedGrowth * 100))

                        return (
                            <motion.div
                                key={trend.topic}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="p-4 rounded-xl border border-[hsl(var(--border))] hover:border-[hsl(var(--brand-primary))]/50 transition-colors"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Trend indicator */}
                                    <div
                                        className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${isGrowing ? "bg-green-500/10" : "bg-red-500/10"
                                            }`}
                                    >
                                        {isGrowing ? (
                                            <TrendingUp className="h-6 w-6 text-green-500" />
                                        ) : (
                                            <TrendingDown className="h-6 w-6 text-red-500" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h4 className="font-medium">{trend.topic}</h4>
                                            <Badge
                                                className={`shrink-0 ${isGrowing
                                                        ? "bg-green-500/10 text-green-600"
                                                        : "bg-red-500/10 text-red-600"
                                                    }`}
                                            >
                                                {isGrowing ? "+" : "-"}{growthPercent}%
                                            </Badge>
                                        </div>

                                        {/* Interest bar */}
                                        <div className="mb-3">
                                            <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] mb-1">
                                                <span>Current Interest</span>
                                                <span>{trend.currentInterest}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                                                <motion.div
                                                    className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--brand-primary))] to-[hsl(var(--brand-secondary))]"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${trend.currentInterest}%` }}
                                                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                                                />
                                            </div>
                                        </div>

                                        {/* Evidence */}
                                        <div className="space-y-1">
                                            {trend.supportingEvidence.slice(0, 2).map((evidence, i) => (
                                                <p key={i} className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                                                    <Sparkles className="h-3 w-3 shrink-0" />
                                                    {evidence}
                                                </p>
                                            ))}
                                        </div>

                                        {/* Confidence */}
                                        <div className="flex items-center gap-2 mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                                            <Info className="h-3 w-3" />
                                            <span>{Math.round(trend.confidence * 100)}% confidence</span>
                                            <span>•</span>
                                            <Clock className="h-3 w-3" />
                                            <span>{selectedTimeframe} forecast</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>

                <Button variant="outline" className="w-full mt-4 gap-2">
                    View All Trends
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </CardContent>
        </Card>
    )
}

// Mini trend indicator for cards
export function TrendIndicator({
    growth,
    size = "sm"
}: {
    growth: number
    size?: "sm" | "lg"
}) {
    const isGrowing = growth > 0
    const Icon = isGrowing ? TrendingUp : TrendingDown
    const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4"
    const textSize = size === "sm" ? "text-xs" : "text-sm"

    return (
        <span
            className={`inline-flex items-center gap-1 font-medium ${textSize} ${isGrowing ? "text-green-500" : "text-red-500"
                }`}
        >
            <Icon className={iconSize} />
            {isGrowing ? "+" : ""}{Math.round(growth * 100)}%
        </span>
    )
}
