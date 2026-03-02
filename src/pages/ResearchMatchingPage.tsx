import { useState } from "react"
import { motion } from "framer-motion"
import { 
    Users, 
    Loader2, 
    Search, 
    UserPlus,
    MessageSquare,
    TrendingUp,
    Briefcase,
    GraduationCap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { matchResearchersToGaps, type ResearcherProfile, type ResearchMatch } from "@/api/gemini"

interface ResearcherInput {
    name: string
    expertise: string
    publications: string
    institution?: string
    hIndex?: number
}

interface GapInput {
    problem: string
    type: string
    impactScore?: string
}

export default function ResearchMatchingPage() {
    const [researchersInput, setResearchersInput] = useState("")
    const [gapsInput, setGapsInput] = useState("")
    const [isMatching, setIsMatching] = useState(false)
    const [matches, setMatches] = useState<ResearchMatch[]>([])
    const [selectedResearcher, setSelectedResearcher] = useState<string | null>(null)

    const parseResearchers = (input: string): ResearcherInput[] => {
        return input.split("\n")
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split("|").map(p => p.trim())
                return {
                    name: parts[0] || "",
                    expertise: parts[1] || "",
                    publications: parts[2] || "",
                    institution: parts[3],
                    hIndex: parts[4] ? parseInt(parts[4]) : undefined
                }
            })
            .filter(r => r.name)
    }

    const parseGaps = (input: string): GapInput[] => {
        return input.split("\n")
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split("|").map(p => p.trim())
                return {
                    problem: parts[0] || "",
                    type: parts[1] || "methodology",
                    impactScore: parts[2]
                }
            })
            .filter(g => g.problem)
    }

    const handleMatch = async () => {
        const researchers = parseResearchers(researchersInput)
        const gaps = parseGaps(gapsInput)
        
        if (researchers.length === 0 || gaps.length === 0) return
        
        setIsMatching(true)
        try {
            const researcherProfiles: ResearcherProfile[] = researchers.map((r, idx) => ({
                id: `researcher-${idx}`,
                name: r.name,
                expertise: r.expertise.split(",").map(e => e.trim()),
                publicationHistory: r.publications.split(",").map(p => p.trim()),
                institution: r.institution,
                hIndex: r.hIndex
            }))

            const gapData = gaps.map((g, idx) => ({
                id: `gap-${idx}`,
                problem: g.problem,
                type: g.type,
                impactScore: g.impactScore
            }))

            const results = await matchResearchersToGaps(researcherProfiles, gapData)
            setMatches(results)
        } catch (error) {
            console.error("Matching error:", error)
        } finally {
            setIsMatching(false)
        }
    }

    const getCollaborationColor = (potential: string) => {
        switch(potential) {
            case "high": return "bg-green-500"
            case "medium": return "bg-yellow-500"
            case "low": return "bg-red-500"
            default: return "bg-gray-500"
        }
    }

    const researcherMatches = selectedResearcher 
        ? matches.filter(m => m.researcher.id === selectedResearcher)
        : matches

    const uniqueResearchers = Array.from(new Set(matches.map(m => m.researcher.id)))

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl">
                        <Users className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Research Matching</h1>
                        <p className="text-muted-foreground">
                            Match researchers to gaps based on their publication history and expertise
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Search className="w-5 h-5" />
                                    Input Data
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Researchers</label>
                                    <CardDescription className="text-xs">Format: name | expertise | publications | institution | h-index</CardDescription>
                                    <Textarea 
                                        placeholder="John Doe | NLP, Transformers | Attention is All You Need, BERT | Stanford | 45"
                                        value={researchersInput}
                                        onChange={(e) => setResearchersInput(e.target.value)}
                                        className="mt-2 min-h-[120px]"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Research Gaps</label>
                                    <CardDescription className="text-xs">Format: problem | type | impact</CardDescription>
                                    <Textarea 
                                        placeholder="Scaling laws for LLMs | methodology | high&#10;Efficient attention mechanisms | methodology | medium"
                                        value={gapsInput}
                                        onChange={(e) => setGapsInput(e.target.value)}
                                        className="mt-2 min-h-[120px]"
                                    />
                                </div>

                                <Button 
                                    onClick={handleMatch}
                                    disabled={isMatching || parseResearchers(researchersInput).length === 0 || parseGaps(gapsInput).length === 0}
                                    className="w-full"
                                >
                                    {isMatching ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Matching...</>
                                    ) : (
                                        <><UserPlus className="w-4 h-4 mr-2" /> Find Matches</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Researcher List</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {uniqueResearchers.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No matches yet</p>
                                ) : (
                                    <div className="space-y-2">
                                        {uniqueResearchers.map(rId => {
                                            const researcher = matches.find(m => m.researcher.id === rId)?.researcher
                                            if (!researcher) return null
                                            return (
                                                <button
                                                    key={rId}
                                                    onClick={() => setSelectedResearcher(selectedResearcher === rId ? null : rId)}
                                                    className={`w-full text-left p-2 rounded-lg transition-colors ${
                                                        selectedResearcher === rId 
                                                            ? "bg-primary text-primary-foreground" 
                                                            : "hover:bg-muted"
                                                    }`}
                                                >
                                                    <div className="font-medium">{researcher.name}</div>
                                                    <div className="text-xs opacity-70">
                                                        {researcher.expertise?.slice(0, 3).join(", ")}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        {matches.length === 0 ? (
                            <Card className="p-12 text-center">
                                <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
                                <p className="text-muted-foreground">
                                    Enter researchers and research gaps to find potential collaborations.
                                </p>
                            </Card>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-semibold">
                                        {selectedResearcher 
                                            ? `Matches for ${matches.find(m => m.researcher.id === selectedResearcher)?.researcher.name}`
                                            : `All Matches (${matches.length})`
                                        }
                                    </h2>
                                </div>

                                {researcherMatches.map((match, idx) => {
                                            const gapId = (match.gap as any).id || `gap-${idx}`;
                                            return (
                                                <motion.div
                                                    key={`${match.researcher.id}-${gapId}`}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                >
                                                    <Card className="overflow-hidden">
                                                        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
                                                            <div className="flex items-start justify-between">
                                                                <div className="space-y-1">
                                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                                        <Users className="w-5 h-5" />
                                                            {match.researcher.name}
                                                        </CardTitle>
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                            {match.researcher.institution && (
                                                                <span className="flex items-center gap-1">
                                                                    <Briefcase className="w-3 h-3" />
                                                                    {match.researcher.institution}
                                                                </span>
                                                            )}
                                                            {match.researcher.hIndex && (
                                                                <span className="flex items-center gap-1">
                                                                    <GraduationCap className="w-3 h-3" />
                                                                    h-index: {match.researcher.hIndex}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-2xl font-bold text-blue-600">
                                                            {Math.round(match.matchScore * 100)}%
                                                        </div>
                                                        <Badge className={getCollaborationColor(match.collaborationPotential)}>
                                                            {match.collaborationPotential} potential
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-4 space-y-3">
                                                <div>
                                                    <h4 className="font-semibold text-sm mb-1">Matched Gap</h4>
                                                    <p className="text-sm bg-muted/50 p-2 rounded">
                                                        {match.gap.problem}
                                                    </p>
                                                    <div className="flex gap-1 mt-1">
                                                        <Badge variant="outline">{match.gap.type}</Badge>
                                                        {match.gap.impactScore && (
                                                            <Badge variant="outline">{match.gap.impactScore} impact</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div>
                                                    <h4 className="font-semibold text-sm flex items-center gap-1 mb-1">
                                                        <TrendingUp className="w-4 h-4" />
                                                        Relevance
                                                    </h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        {match.relevanceReason}
                                                    </p>
                                                </div>

                                                <div className="flex gap-2 pt-2">
                                                    <Button variant="outline" size="sm">
                                                        <MessageSquare className="w-4 h-4 mr-1" />
                                                        Contact
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                            </motion.div>
                                            );
                                        })}
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
