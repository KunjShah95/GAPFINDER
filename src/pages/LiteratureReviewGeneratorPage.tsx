import { useState } from "react"
import { motion } from "framer-motion"
import { 
    FileText, 
    Loader2, 
    Copy, 
    Download, 
    Check,
    BookOpen,
    Quote,
    FileCode,
    Settings
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { generateLiteratureReview, formatCitation, formatMultipleCitations, generateBibtex, type Citation, type CitationStyle } from "@/api/gemini"

interface PaperInput {
    title: string
    authors: string
    venue?: string
    year?: string
    abstract?: string
}

interface ReviewConfig {
    title: string
    includeAbstracts: boolean
    includeGaps: boolean
    includeMethodology: boolean
    groupByTheme: boolean
    citationStyle: CitationStyle
    minPapers: number
    maxPapers: number
}

export default function LiteratureReviewPage() {
    const [papersInput, setPapersInput] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [review, setReview] = useState("")
    const [citations, setCitations] = useState<Citation[]>([])
    const [formattedCitations, setFormattedCitations] = useState<Record<string, string>>({})
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [config, setConfig] = useState<ReviewConfig>({
        title: "Related Work",
        includeAbstracts: true,
        includeGaps: true,
        includeMethodology: false,
        groupByTheme: true,
        citationStyle: "apa",
        minPapers: 3,
        maxPapers: 20
    })

    const parsePapers = (input: string): PaperInput[] => {
        return input.split("\n")
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split("|").map(p => p.trim())
                return {
                    title: parts[0] || "",
                    authors: parts[1] || "Unknown Authors",
                    venue: parts[2],
                    year: parts[3]
                }
            })
            .filter(p => p.title)
    }

    const handleGenerateReview = async () => {
        const papers = parsePapers(papersInput)
        if (papers.length < config.minPapers) return
        
        setIsGenerating(true)
        try {
            const result = await generateLiteratureReview(
                papers.map(p => ({
                    title: p.title,
                    content: p.abstract,
                    authors: p.authors.split(",").map(a => a.trim()),
                    venue: p.venue,
                    year: p.year
                })),
                config
            )
            setReview(result)
        } catch (error) {
            console.error("Review generation error:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleFormatCitations = async () => {
        const papers = parsePapers(papersInput)
        const parsedCitations: Citation[] = papers.map((p, idx) => ({
            id: `cite-${idx}`,
            title: p.title,
            authors: p.authors.split(",").map(a => a.trim()),
            year: parseInt(p.year || "2024"),
            venue: p.venue
        }))
        
        setCitations(parsedCitations)
        
        const formatted = await formatMultipleCitations(parsedCitations, config.citationStyle)
        const formattedMap: Record<string, string> = {}
        formatted.forEach(f => {
            formattedMap[f.id] = f.formatted
        })
        setFormattedCitations(formattedMap)
    }

    const handleGenerateBibtex = async () => {
        const papers = parsePapers(papersInput)
        const bibtexResults: Record<string, string> = {}
        
        for (let i = 0; i < papers.length; i++) {
            const p = papers[i]
            const citation: Citation = {
                id: `cite-${i}`,
                title: p.title,
                authors: p.authors.split(",").map(a => a.trim()),
                year: parseInt(p.year || "2024"),
                venue: p.venue
            }
            bibtexResults[`cite-${i}`] = await generateBibtex(citation)
        }
        
        setFormattedCitations(bibtexResults)
    }

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-green-600 to-teal-600 rounded-xl">
                        <BookOpen className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Literature Review Generator</h1>
                        <p className="text-muted-foreground">
                            Generate publication-quality literature reviews with proper citation formatting
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="w-5 h-5" />
                                    Review Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Review Title</label>
                                    <input 
                                        type="text"
                                        value={config.title}
                                        onChange={(e) => setConfig({...config, title: e.target.value})}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Citation Style</label>
                                    <select 
                                        value={config.citationStyle}
                                        onChange={(e) => setConfig({...config, citationStyle: e.target.value as CitationStyle})}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="apa">APA</option>
                                        <option value="mla">MLA</option>
                                        <option value="chicago">Chicago</option>
                                        <option value="ieee">IEEE</option>
                                        <option value="bibtex">BibTeX</option>
                                        <option value="nature">Nature</option>
                                        <option value="cell">Cell</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input 
                                            type="checkbox"
                                            checked={config.includeAbstracts}
                                            onChange={(e) => setConfig({...config, includeAbstracts: e.target.checked})}
                                        />
                                        Include Abstracts
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input 
                                            type="checkbox"
                                            checked={config.includeGaps}
                                            onChange={(e) => setConfig({...config, includeGaps: e.target.checked})}
                                        />
                                        Include Gaps
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input 
                                            type="checkbox"
                                            checked={config.groupByTheme}
                                            onChange={(e) => setConfig({...config, groupByTheme: e.target.checked})}
                                        />
                                        Group by Theme
                                    </label>
                                </div>

                                <Button 
                                    onClick={handleGenerateReview}
                                    disabled={isGenerating || parsePapers(papersInput).length < config.minPapers}
                                    className="w-full"
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                                    ) : (
                                        <><BookOpen className="w-4 h-4 mr-2" /> Generate Review</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Papers Input</CardTitle>
                                <CardDescription>Format: title | authors | venue | year</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea 
                                    placeholder="Attention Is All You Need | Vaswani et al. | NeurIPS | 2017&#10;BERT: Pre-training of Deep Bidirectional Transformers | Devlin et al. | NAACL | 2019&#10;GPT-3: Language Models are Few-Shot Learners | Brown et al. | NeurIPS | 2020"
                                    value={papersInput}
                                    onChange={(e) => setPapersInput(e.target.value)}
                                    className="min-h-[200px]"
                                />
                                <div className="mt-2 text-sm text-muted-foreground">
                                    {parsePapers(papersInput).length} papers entered
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Generated Review</CardTitle>
                                    {review && (
                                        <div className="flex gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => copyToClipboard(review, "review")}
                                            >
                                                {copiedId === "review" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                <span className="ml-2">Copy</span>
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={handleFormatCitations}
                                                disabled={citations.length === 0}
                                            >
                                                <Quote className="w-4 h-4 mr-1" />
                                                Format Citations
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={handleGenerateBibtex}
                                                disabled={citations.length === 0}
                                            >
                                                <FileCode className="w-4 h-4 mr-1" />
                                                BibTeX
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {review ? (
                                    <div className="prose dark:prose-invert max-w-none">
                                        <div className="whitespace-pre-wrap">{review}</div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <p>Configure and generate a literature review</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {Object.keys(formattedCitations).length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Formatted Citations</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {Object.entries(formattedCitations).map(([id, citation]) => (
                                        <div 
                                            key={id}
                                            className="p-3 rounded-lg bg-muted/50 flex items-start justify-between gap-2"
                                        >
                                            <pre className="text-sm whitespace-pre-wrap flex-1 font-mono">
                                                {citation}
                                            </pre>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={() => copyToClipboard(citation, id)}
                                            >
                                                {copiedId === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
