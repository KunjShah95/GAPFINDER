import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { 
    Bot, 
    Loader2, 
    Play, 
    Pause, 
    RotateCcw,
    Search,
    FileText,
    Target,
    Lightbulb,
    ArrowRight,
    CheckCircle2,
    Circle,
    Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { runAgenticResearch, type AgentTask, type AgentState, type AgentResult } from "@/api/gemini"

export default function AgenticResearchPage() {
    const [topic, setTopic] = useState("")
    const [isRunning, setIsRunning] = useState(false)
    const [agentState, setAgentState] = useState<AgentState | null>(null)
    const [result, setResult] = useState<AgentResult | null>(null)
    const [config, setConfig] = useState({
        maxIterations: 5,
        includeCrawl: true,
        includeAnalysis: true,
        includeComparison: true
    })

    const handleStartResearch = async () => {
        if (!topic.trim()) return
        
        setIsRunning(true)
        setAgentState(null)
        setResult(null)

        try {
            const task: AgentTask = {
                id: `task-${Date.now()}`,
                topic: topic,
                maxIterations: config.maxIterations,
                includeCrawl: config.includeCrawl,
                includeAnalysis: config.includeAnalysis,
                includeComparison: config.includeComparison
            }

            const agentResult = await runAgenticResearch(task, (state) => {
                setAgentState(state)
            })

            setResult(agentResult)
        } catch (error) {
            console.error("Agent error:", error)
        } finally {
            setIsRunning(false)
        }
    }

    const handleReset = () => {
        setAgentState(null)
        setResult(null)
        setTopic("")
    }

    const getActionIcon = (action: string) => {
        switch(action) {
            case "search": return <Search className="w-4 h-4" />
            case "crawl": return <FileText className="w-4 h-4" />
            case "analyze": return <Target className="w-4 h-4" />
            case "compare": return <ArrowRight className="w-4 h-4" />
            case "suggest": return <Lightbulb className="w-4 h-4" />
            case "synthesize": return <Bot className="w-4 h-4" />
            default: return <Circle className="w-4 h-4" />
        }
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl">
                        <Bot className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Agentic Research Assistant</h1>
                        <p className="text-muted-foreground">
                            Multi-turn autonomous agent that explores research topics
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Bot className="w-5 h-5" />
                                    Research Task
                                </CardTitle>
                                <CardDescription>Define your research topic and agent behavior</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Research Topic</label>
                                    <Textarea 
                                        placeholder="e.g., What are the current challenges in LLM alignment?"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        className="mt-2"
                                        disabled={isRunning}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Agent Configuration</label>
                                    
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox"
                                            checked={config.includeCrawl}
                                            onChange={(e) => setConfig({...config, includeCrawl: e.target.checked})}
                                            disabled={isRunning}
                                        />
                                        <span className="text-sm">Crawl papers for content</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox"
                                            checked={config.includeAnalysis}
                                            onChange={(e) => setConfig({...config, includeAnalysis: e.target.checked})}
                                            disabled={isRunning}
                                        />
                                        <span className="text-sm">Analyze for gaps</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox"
                                            checked={config.includeComparison}
                                            onChange={(e) => setConfig({...config, includeComparison: e.target.checked})}
                                            disabled={isRunning}
                                        />
                                        <span className="text-sm">Compare papers</span>
                                    </div>

                                    <div className="pt-2">
                                        <label className="text-sm">Max Iterations: {config.maxIterations}</label>
                                        <input 
                                            type="range"
                                            value={config.maxIterations}
                                            onChange={(e) => setConfig({...config, maxIterations: parseInt(e.target.value)})}
                                            min={1} max={20}
                                            className="w-full mt-1"
                                            disabled={isRunning}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button 
                                        onClick={handleStartResearch}
                                        disabled={isRunning || !topic.trim()}
                                        className="flex-1"
                                    >
                                        {isRunning ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                                        ) : (
                                            <><Play className="w-4 h-4 mr-2" /> Start Research</>
                                        )}
                                    </Button>
                                    
                                    {!isRunning && (agentState || result) && (
                                        <Button 
                                            onClick={handleReset}
                                            variant="outline"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {(agentState || result) && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Agent Status</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {agentState && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Topic:</span>
                                                <span className="text-sm font-medium truncate ml-2">{agentState.currentTopic}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Actions:</span>
                                                <Badge>{agentState.completedActions.length}</Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Papers Found:</span>
                                                <Badge variant="outline">{agentState.gatheredPapers.length}</Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Gaps Found:</span>
                                                <Badge variant="outline">{agentState.identifiedGaps.length}</Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm">Status:</span>
                                                {agentState.isComplete ? (
                                                    <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>
                                                ) : (
                                                    <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Running</Badge>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        {agentState && agentState.completedActions.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Agent Actions Log</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {agentState.completedActions.map((action, idx) => (
                                            <div 
                                                key={idx}
                                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                                            >
                                                <div className="mt-0.5">
                                                    {getActionIcon(action.action)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs">
                                                            {action.action}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {new Date(action.timestamp).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm mt-1 line-clamp-2">{action.result}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {result ? (
                            <Card>
                                <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950 dark:to-purple-950">
                                    <CardTitle>Final Research Report</CardTitle>
                                    <div className="flex gap-2 mt-2">
                                        <Badge>{result.iterations} iterations</Badge>
                                        <Badge variant="outline">{result.papersFound.length} papers</Badge>
                                        <Badge variant="outline">{result.gapsIdentified.length} gaps</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-6">
                                    <div>
                                        <h3 className="font-semibold mb-2">Executive Summary</h3>
                                        <div className="prose dark:prose-invert max-w-none">
                                            <p className="whitespace-pre-wrap">{result.finalReport}</p>
                                        </div>
                                    </div>

                                    {result.gapsIdentified.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold mb-2">Identified Research Gaps</h3>
                                            <ul className="space-y-2">
                                                {result.gapsIdentified.map((gap, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                                                        <Target className="w-4 h-4 mt-0.5 text-primary" />
                                                        <span className="text-sm">{gap}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {result.suggestedNextSteps.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                                <Lightbulb className="w-4 h-4" />
                                                Suggested Next Steps
                                            </h3>
                                            <ul className="space-y-2">
                                                {result.suggestedNextSteps.map((step, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                                                        <ArrowRight className="w-4 h-4 mt-0.5 text-amber-600" />
                                                        <span className="text-sm">{step}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ) : !isRunning ? (
                            <Card className="p-12 text-center">
                                <Bot className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Ready to Research</h3>
                                <p className="text-muted-foreground">
                                    Enter a research topic and start the agent to begin autonomous exploration.
                                </p>
                            </Card>
                        ) : (
                            <Card className="p-12 text-center">
                                <Loader2 className="w-16 h-16 mx-auto text-primary mb-4 animate-spin" />
                                <h3 className="text-lg font-semibold mb-2">Agent is Running</h3>
                                <p className="text-muted-foreground">
                                    The research agent is actively exploring your topic...
                                </p>
                            </Card>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
