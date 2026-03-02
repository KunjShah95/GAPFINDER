import { useState } from "react"
import { motion } from "framer-motion"
import { 
    Image, 
    Table as TableIcon,
    Sigma,
    Loader2,
    Search,
    BarChart3,
    AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { performMultiModalAnalysis, type MultiModalAnalysis } from "@/api/gemini"

export default function MultiModalPage() {
    const [content, setContent] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysis, setAnalysis] = useState<MultiModalAnalysis | null>(null)
    const [activeTab, setActiveTab] = useState<"content" | "figures" | "tables" | "equations">("content")

    const handleAnalyzeContent = async () => {
        if (!content.trim()) return
        
        setIsAnalyzing(true)
        try {
            const result = await performMultiModalAnalysis(content, {
                includeFigures: true,
                includeTables: true,
                includeEquations: true
            })
            setAnalysis(result)
        } catch (error) {
            console.error("Analysis error:", error)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const getQualityColor = (quality: string) => {
        switch(quality) {
            case "excellent": return "bg-green-500"
            case "good": return "bg-blue-500"
            case "fair": return "bg-yellow-500"
            case "poor": return "bg-red-500"
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
                    <div className="p-3 bg-gradient-to-br from-pink-600 to-rose-600 rounded-xl">
                        <Image className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Multi-Modal Analysis</h1>
                        <p className="text-muted-foreground">
                            Analyze figures, tables, and equations from research papers
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Search className="w-5 h-5" />
                                    Input Content
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Textarea 
                                    placeholder="Paste paper content with figures, tables, or equations..."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="min-h-[300px]"
                                />

                                <Button 
                                    onClick={handleAnalyzeContent}
                                    disabled={isAnalyzing || !content.trim()}
                                    className="w-full"
                                >
                                    {isAnalyzing ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                                    ) : (
                                        <><BarChart3 className="w-4 h-4 mr-2" /> Analyze Content</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {analysis && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Analysis Summary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Image className="w-4 h-4" />
                                                <span className="text-sm">Figures</span>
                                            </div>
                                            <Badge>{analysis.figures.length}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <TableIcon className="w-4 h-4" />
                                                <span className="text-sm">Tables</span>
                                            </div>
                                            <Badge>{analysis.tables.length}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Sigma className="w-4 h-4" />
                                                <span className="text-sm">Equations</span>
                                            </div>
                                            <Badge>{analysis.equations.length}</Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex gap-2 border-b">
                            <button
                                onClick={() => setActiveTab("content")}
                                className={`px-4 py-2 border-b-2 transition-colors ${
                                    activeTab === "content" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                }`}
                            >
                                Summary
                            </button>
                            <button
                                onClick={() => setActiveTab("figures")}
                                className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
                                    activeTab === "figures" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                }`}
                            >
                                <Image className="w-4 h-4" />
                                Figures ({analysis?.figures.length || 0})
                            </button>
                            <button
                                onClick={() => setActiveTab("tables")}
                                className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
                                    activeTab === "tables" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                }`}
                            >
                                <TableIcon className="w-4 h-4" />
                                Tables ({analysis?.tables.length || 0})
                            </button>
                            <button
                                onClick={() => setActiveTab("equations")}
                                className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
                                    activeTab === "equations" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                }`}
                            >
                                <Sigma className="w-4 h-4" />
                                Equations ({analysis?.equations.length || 0})
                            </button>
                        </div>

                        {!analysis ? (
                            <Card className="p-12 text-center">
                                <Image className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
                                <p className="text-muted-foreground">Paste paper content to analyze.</p>
                            </Card>
                        ) : (
                            <>
                                {activeTab === "content" && (
                                    <Card>
                                        <CardHeader><CardTitle>Analysis Summary</CardTitle></CardHeader>
                                        <CardContent><p className="whitespace-pre-wrap">{analysis.summary}</p></CardContent>
                                    </Card>
                                )}

                                {activeTab === "figures" && analysis.figures.map((fig, idx) => (
                                    <Card key={idx}>
                                        <CardHeader className="bg-gradient-to-r from-pink-50 to-rose-50">
                                            <CardTitle className="text-lg">Figure {idx + 1}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pt-4">
                                            <div><h4 className="font-semibold text-sm">Description</h4><p className="text-sm">{fig.description}</p></div>
                                            <div>
                                                <h4 className="font-semibold text-sm mb-2">Key Findings</h4>
                                                <ul className="list-disc list-inside text-sm">
                                                    {fig.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                                                </ul>
                                            </div>
                                            {fig.limitations.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-1"><AlertCircle className="w-4 h-4" />Limitations</h4>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                                                        {fig.limitations.map((l, i) => <li key={i}>{l}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}

                                {activeTab === "tables" && analysis.tables.map((table, idx) => (
                                    <Card key={idx}>
                                        <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                                            <CardTitle className="text-lg flex items-center justify-between">
                                                <span>Table {idx + 1}</span>
                                                <Badge className={getQualityColor(table.dataQuality)}>{table.dataQuality}</Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pt-4">
                                            <div><h4 className="font-semibold text-sm">Description</h4><p className="text-sm">{table.description}</p></div>
                                            <div>
                                                <h4 className="font-semibold text-sm mb-2">Key Insights</h4>
                                                <ul className="list-disc list-inside text-sm">
                                                    {table.keyInsights.map((ins, i) => <li key={i}>{ins}</li>)}
                                                </ul>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}

                                {activeTab === "equations" && analysis.equations.map((eq, idx) => (
                                    <Card key={idx}>
                                        <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50">
                                            <CardTitle className="text-lg">Equation {idx + 1}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pt-4">
                                            <div><h4 className="font-semibold text-sm">LaTeX</h4><pre className="text-sm bg-muted p-2 rounded">{eq.latex}</pre></div>
                                            <div><h4 className="font-semibold text-sm">Description</h4><p className="text-sm">{eq.description}</p></div>
                                            {Object.keys(eq.variables).length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold text-sm mb-2">Variables</h4>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {Object.entries(eq.variables).map(([v, d], i) => (
                                                            <div key={i} className="text-sm bg-muted/50 p-2 rounded">
                                                                <code className="text-primary">{v}</code>: {d}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
