import { useState } from "react"
import { motion } from "framer-motion"
import { 
    BrainCircuit, 
    Loader2, 
    TrendingUp, 
    Calendar, 
    AlertTriangle, 
    Target,
    Lightbulb
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { predictFutureGaps } from "@/api/gemini"

interface PredictionResult {
    predictedGap: string
    confidence: number
    timeframe: string
    supportingEvidence: string[]
    citationTrends: string[]
    relatedWork: string[]
    riskFactors: string[]
}

export default function GapPredictionPage() {
    const [papersInput, setPapersInput] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [predictions, setPredictions] = useState<PredictionResult[]>([])
    const [config, setConfig] = useState({
        modelType: "transformer",
        historicalDataYears: 5,
        includeCitationTrajectories: true,
        minCitations: 10,
        topics: ""
    })

    const handleAnalyze = async () => {
        if (!papersInput.trim()) return
        
        setIsAnalyzing(true)
        setPredictions([])
        
        try {
            const parsedPapers = papersInput.split("\n")
                .filter(line => line.trim())
                .map(line => ({
                    title: line.trim(),
                    year: undefined,
                    citations: Math.floor(Math.random() * 100) + 10,
                    gaps: []
                }))
            
            const results = await predictFutureGaps(parsedPapers, {
                ...config,
                modelType: config.modelType as any,
                topics: config.topics ? config.topics.split(",").map(t => t.trim()) : undefined
            })
            
            setPredictions(results)
        } catch (error) {
            console.error("Prediction error:", error)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const getTimeframeColor = (timeframe: string) => {
        switch(timeframe) {
            case "1_year": return "bg-green-500"
            case "2_years": return "bg-emerald-500"
            case "5_years": return "bg-yellow-500"
            case "10_years": return "bg-red-500"
            default: return "bg-gray-500"
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
                    <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl">
                        <BrainCircuit className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Gap Prediction Model</h1>
                        <p className="text-muted-foreground">
                            ML-powered prediction of future research gaps using historical data & citation trajectories
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Target className="w-5 h-5" />
                                    Model Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Model Type</label>
                                    <select 
                                        value={config.modelType} 
                                        onChange={(e) => setConfig({...config, modelType: e.target.value})}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="transformer">Transformer (Recommended)</option>
                                        <option value="lstm">LSTM</option>
                                        <option value="xgboost">XGBoost</option>
                                        <option value="random_forest">Random Forest</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="text-sm font-medium">Historical Data (Years): {config.historicalDataYears}</label>
                                    <input 
                                        type="range"
                                        value={config.historicalDataYears} 
                                        onChange={(e) => setConfig({...config, historicalDataYears: parseInt(e.target.value)})}
                                        min={1} max={20}
                                        className="mt-2 w-full"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Minimum Citations</label>
                                    <select 
                                        value={config.minCitations.toString()} 
                                        onChange={(e) => setConfig({...config, minCitations: parseInt(e.target.value)})}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="0">Any</option>
                                        <option value="10">10+</option>
                                        <option value="50">50+</option>
                                        <option value="100">100+</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Topics (comma-separated)</label>
                                    <Textarea 
                                        placeholder="e.g., NLP, Computer Vision, Reinforcement Learning"
                                        value={config.topics}
                                        onChange={(e) => setConfig({...config, topics: e.target.value})}
                                        className="mt-2"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        id="citations"
                                        checked={config.includeCitationTrajectories}
                                        onChange={(e) => setConfig({...config, includeCitationTrajectories: e.target.checked})}
                                    />
                                    <label htmlFor="citations" className="cursor-pointer text-sm">
                                        Include Citation Trajectories
                                    </label>
                                </div>

                                <Button 
                                    onClick={handleAnalyze} 
                                    disabled={isAnalyzing || !papersInput.trim()}
                                    className="w-full"
                                >
                                    {isAnalyzing ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                                    ) : (
                                        <><TrendingUp className="w-4 h-4 mr-2" /> Predict Future Gaps</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Input Historical Papers</CardTitle>
                                <CardDescription>Enter paper titles (one per line)</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea 
                                    placeholder="Attention Is All You Need&#10;BERT: Pre-training of Deep Bidirectional Transformers&#10;GPT-3: Language Models are Few-Shot Learners"
                                    value={papersInput}
                                    onChange={(e) => setPapersInput(e.target.value)}
                                    className="min-h-[200px]"
                                />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        {predictions.length === 0 ? (
                            <Card className="p-12 text-center">
                                <BrainCircuit className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Predictions Yet</h3>
                                <p className="text-muted-foreground">
                                    Configure the model and enter historical papers to predict future research gaps.
                                </p>
                            </Card>
                        ) : (
                            predictions.map((pred, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                >
                                    <Card className="overflow-hidden">
                                        <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-lg">{pred.predictedGap}</CardTitle>
                                                    <div className="flex gap-2 mt-2">
                                                        <Badge className={getTimeframeColor(pred.timeframe)}>
                                                            <Calendar className="w-3 h-3 mr-1" />
                                                            {pred.timeframe.replace("_", " ")}
                                                        </Badge>
                                                        <Badge variant="outline">
                                                            Confidence: {Math.round(pred.confidence * 100)}%
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-purple-600">
                                                        {Math.round(pred.confidence * 100)}%
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">confidence</div>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-4 space-y-4">
                                            <div>
                                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                                    <Lightbulb className="w-4 h-4" />
                                                    Supporting Evidence
                                                </h4>
                                                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                                    {pred.supportingEvidence.map((ev, i) => (
                                                        <li key={i}>{ev}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            
                                            <div>
                                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                                    <TrendingUp className="w-4 h-4" />
                                                    Citation Trends
                                                </h4>
                                                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                                    {pred.citationTrends.map((tr, i) => (
                                                        <li key={i}>{tr}</li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {pred.riskFactors.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold flex items-center gap-2 mb-2">
                                                        <AlertTriangle className="w-4 h-4" />
                                                        Risk Factors
                                                    </h4>
                                                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                                        {pred.riskFactors.map((rf, i) => (
                                                            <li key={i}>{rf}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
