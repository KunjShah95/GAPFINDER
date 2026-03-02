import { useState } from "react"
import { motion } from "framer-motion"
import { 
    FileSignature, 
    Loader2, 
    Copy, 
    Download, 
    Check,
    Building2,
    DollarSign,
    Clock,
    Users,
    Lightbulb,
    Target,
    ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { generateGrantProposal, generateMultipleGrantProposals, type GrantAgency, type GrantProposal } from "@/api/gemini"

interface GapInput {
    problem: string
    type: string
    assumptions?: string
    failures?: string
}

export default function GrantPipelinePage() {
    const [gapInput, setGapInput] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [proposals, setProposals] = useState<GrantProposal[]>([])
    const [selectedAgency, setSelectedAgency] = useState<GrantAgency>("nsf")
    const [selectedProposal, setSelectedProposal] = useState<number | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const agencies: { value: GrantAgency; label: string; icon: string }[] = [
        { value: "nsf", label: "NSF", icon: "National Science Foundation" },
        { value: "nih", label: "NIH", icon: "National Institutes of Health" },
        { value: "erc", label: "ERC", icon: "European Research Council" },
        { value: "darpa", label: "DARPA", icon: "Defense Advanced Research Projects Agency" },
        { value: "industry", label: "Industry", icon: "Private Foundation/Industry" }
    ]

    const parseGap = (input: string): GapInput | null => {
        const parts = input.split("|").map(p => p.trim())
        if (!parts[0]) return null
        return {
            problem: parts[0],
            type: parts[1] || "methodology",
            assumptions: parts[2],
            failures: parts[3]
        }
    }

    const handleGenerate = async () => {
        const gap = parseGap(gapInput)
        if (!gap) return
        
        setIsGenerating(true)
        try {
            const proposal = await generateGrantProposal(
                {
                    problem: gap.problem,
                    type: gap.type,
                    assumptions: gap.assumptions?.split(",").map(s => s.trim()),
                    failures: gap.failures?.split(",").map(s => s.trim())
                },
                selectedAgency
            )
            setProposals([proposal])
            setSelectedProposal(0)
        } catch (error) {
            console.error("Proposal generation error:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleGenerateBatch = async () => {
        const gaps = gapInput.split("\n")
            .map(line => parseGap(line))
            .filter((g): g is GapInput => g !== null)
        
        if (gaps.length === 0) return
        
        setIsGenerating(true)
        try {
            const results = await generateMultipleGrantProposals(
                gaps.map(g => ({ problem: g.problem, type: g.type })),
                selectedAgency
            )
            setProposals(results)
            setSelectedProposal(results.length > 0 ? 0 : null)
        } catch (error) {
            console.error("Batch generation error:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const currentProposal = selectedProposal !== null ? proposals[selectedProposal] : null

    const formatProposalText = (p: GrantProposal) => {
        return `# ${p.title}

## Abstract
${p.abstract}

## Specific Aims
${p.specificAims.map((aim, i) => `${i + 1}. ${aim}`).join("\n")}

## Significance
${p.significance}

## Innovation
${p.innovation}

## Approach
${p.approach}

## Timeline
${p.timeline}
${p.budget ? `\n## Budget\n${p.budget}` : ""}
${p.teamQualifications ? `\n## Team Qualifications\n${p.teamQualifications}` : ""}
`
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-amber-600 to-orange-600 rounded-xl">
                        <FileSignature className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Gap-to-Grant Pipeline</h1>
                        <p className="text-muted-foreground">
                            Auto-draft NSF/NIH/ERC grant proposals from research gaps
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Building2 className="w-5 h-5" />
                                    Funding Agency
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {agencies.map(agency => (
                                        <button
                                            key={agency.value}
                                            onClick={() => setSelectedAgency(agency.value)}
                                            className={`p-3 rounded-lg border-2 transition-all ${
                                                selectedAgency === agency.value
                                                    ? "border-primary bg-primary/10"
                                                    : "border-muted hover:border-muted-foreground"
                                            }`}
                                        >
                                            <div className="font-semibold text-sm">{agency.label}</div>
                                            <div className="text-xs text-muted-foreground">{agency.icon}</div>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Research Gap</CardTitle>
                                <CardDescription>Format: problem | type | assumptions | failures</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Textarea 
                                    placeholder="Scaling laws for large language models | methodology | assumes abundant compute | flat scaling observed at large scale"
                                    value={gapInput}
                                    onChange={(e) => setGapInput(e.target.value)}
                                    className="min-h-[120px]"
                                />

                                <div className="flex gap-2">
                                    <Button 
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !gapInput.trim()}
                                        className="flex-1"
                                    >
                                        {isGenerating ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /></>
                                        ) : (
                                            <><FileSignature className="w-4 h-4 mr-2" /></>
                                        )}
                                        Generate
                                    </Button>
                                    <Button 
                                        onClick={handleGenerateBatch}
                                        disabled={isGenerating || !gapInput.trim()}
                                        variant="outline"
                                        title="Generate for multiple gaps"
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {proposals.length > 1 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Generated Proposals ({proposals.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {proposals.map((p, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedProposal(idx)}
                                                className={`w-full text-left p-2 rounded-lg transition-colors ${
                                                    selectedProposal === idx 
                                                        ? "bg-primary text-primary-foreground" 
                                                        : "hover:bg-muted"
                                                }`}
                                            >
                                                <div className="font-medium text-sm truncate">{p.title}</div>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        {currentProposal ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="text-sm">
                                        {selectedAgency.toUpperCase()} Proposal
                                    </Badge>
                                    <div className="flex gap-2">
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => copyToClipboard(formatProposalText(currentProposal), "proposal")}
                                        >
                                            {copiedId === "proposal" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            <span className="ml-2">Copy</span>
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => {
                                                const blob = new Blob([formatProposalText(currentProposal)], { type: "text/markdown" })
                                                const url = URL.createObjectURL(blob)
                                                const a = document.createElement("a")
                                                a.href = url
                                                a.download = `${currentProposal.title.slice(0, 30)}.md`
                                                a.click()
                                            }}
                                        >
                                            <Download className="w-4 h-4 mr-1" />
                                            Export
                                        </Button>
                                    </div>
                                </div>

                                <Card>
                                    <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950">
                                        <CardTitle className="text-xl">{currentProposal.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-6 pt-6">
                                        <div>
                                            <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                <Target className="w-4 h-4" />
                                                Abstract
                                            </h3>
                                            <p className="text-sm leading-relaxed">{currentProposal.abstract}</p>
                                        </div>

                                        <div>
                                            <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                <Lightbulb className="w-4 h-4" />
                                                Specific Aims
                                            </h3>
                                            <ul className="space-y-2">
                                                {currentProposal.specificAims.map((aim, idx) => (
                                                    <li key={idx} className="flex gap-2">
                                                        <span className="font-semibold text-primary">{idx + 1}.</span>
                                                        <span className="text-sm">{aim}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                    <Target className="w-4 h-4" />
                                                    Significance
                                                </h3>
                                                <p className="text-sm text-muted-foreground">{currentProposal.significance}</p>
                                            </div>
                                            <div>
                                                <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                    <Lightbulb className="w-4 h-4" />
                                                    Innovation
                                                </h3>
                                                <p className="text-sm text-muted-foreground">{currentProposal.innovation}</p>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                <Clock className="w-4 h-4" />
                                                Approach & Timeline
                                            </h3>
                                            <p className="text-sm leading-relaxed">{currentProposal.approach}</p>
                                            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                                                <p className="text-sm">{currentProposal.timeline}</p>
                                            </div>
                                        </div>

                                        {currentProposal.budget && (
                                            <div>
                                                <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                    <DollarSign className="w-4 h-4" />
                                                    Budget
                                                </h3>
                                                <p className="text-sm">{currentProposal.budget}</p>
                                            </div>
                                        )}

                                        {currentProposal.teamQualifications && (
                                            <div>
                                                <h3 className="font-semibold flex items-center gap-2 mb-2">
                                                    <Users className="w-4 h-4" />
                                                    Team Qualifications
                                                </h3>
                                                <p className="text-sm">{currentProposal.teamQualifications}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <Card className="p-12 text-center">
                                <FileSignature className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Proposal Generated</h3>
                                <p className="text-muted-foreground">
                                    Enter a research gap and select a funding agency to generate a grant proposal.
                                </p>
                            </Card>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
