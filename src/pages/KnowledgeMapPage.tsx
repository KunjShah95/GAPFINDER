import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
    Maximize2,
    Search,
    ArrowLeft,
    Network,
    Info
} from "lucide-react"
import { Link } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { getCrawlResults } from "@/lib/firestore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function KnowledgeMapPage() {
    const { user } = useAuth()
    const [gaps, setGaps] = useState<any[]>([])
    const [selectedGap, setSelectedGap] = useState<any>(null)

    useEffect(() => {
        async function load() {
            if (!user) return
            const data = await getCrawlResults(user.id)
            const allGaps = data.flatMap(r => r.gaps.map(g => ({
                ...g,
                paper: r.title,
                venue: r.venue || "arXiv"
            })))
            setGaps(allGaps)
        }
        load()
    }, [user])

    // deterministic pseudo-random positions based on id to satisfy purity rules
    const seededPosition = (id: string, min: number, max: number) => {
        let h = 0
        for (let i = 0; i < id.length; i++) {
            h = (h << 5) - h + id.charCodeAt(i)
            h |= 0
        }
        const ratio = (Math.abs(h) % 1000) / 1000
        return min + Math.floor(ratio * (max - min))
    }

    const nodes = useMemo(() => {
        return gaps.map((gap) => ({
            ...gap,
            x: seededPosition(gap.id ?? gap.paper ?? 'node', 100, 900),
            y: seededPosition((gap.id ?? gap.paper ?? 'node') + '_y', 100, 600),
        }))
    }, [gaps])

    const links = useMemo(() => {
        const result: any[] = []
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                if (nodes[i].type === nodes[j].type || nodes[i].venue === nodes[j].venue) {
                    result.push({ source: nodes[i], target: nodes[j] })
                }
            }
        }
        return result
    }, [nodes])

    return (
        <div className="min-h-screen bg-[rgb(var(--glass-bg))] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-[rgb(255 255 255 / 0.08)] flex items-center justify-between glass z-10">
                <div className="flex items-center gap-6">
                    <Link to="/insights" className="h-10 w-10 rounded-full border border-[rgb(255 255 255 / 0.08)] flex items-center justify-center hover:bg-[rgb(255 255 255 / 0.06)] transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Network className="h-5 w-5 text-[rgb(251 146 60)]" />
                            Research Landscape Map
                        </h1>
                        <p className="text-xs text-[rgb(var(--text-secondary))] uppercase tracking-widest font-bold">
                            Interactive visual clustering of {gaps.length} research gaps
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-4 mr-6 px-4 py-2 bg-[rgb(255 255 255 / 0.06)] rounded-full border border-[rgb(255 255 255 / 0.08)]">
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                            <span className="h-2 w-2 rounded-full bg-yellow-500" /> Data
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                            <span className="h-2 w-2 rounded-full bg-red-500" /> Compute
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                            <span className="h-2 w-2 rounded-full bg-blue-500" /> Evaluation
                        </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Search className="h-4 w-4" /> Find Node
                    </Button>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative bg-dot-pattern">
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                    {links.map((link, i) => (
                        <line
                            key={i}
                            x1={link.source.x}
                            y1={link.source.y}
                            x2={link.target.x}
                            y2={link.target.y}
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                        />
                    ))}
                </svg>

                {nodes.map((node, i) => (
                    <motion.div
                        key={i}
                        drag
                        dragConstraints={{ left: 0, right: 1000, top: 0, bottom: 600 }}
                        initial={{ scale: 0, x: node.x, y: node.y }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                        className="absolute cursor-grab active:cursor-grabbing"
                        style={{ left: 0, top: 0 }}
                        onClick={() => setSelectedGap(node)}
                    >
                        <div className={cn(
                            "h-5 w-5 rounded-full border-2 border-white shadow-lg transition-all",
                            node.type === 'data' ? 'bg-yellow-500' :
                                node.type === 'compute' ? 'bg-red-500' :
                                    node.type === 'evaluation' ? 'bg-blue-500' :
                                        node.type === 'theory' ? 'bg-purple-500' : 'bg-emerald-500',
                            selectedGap?.id === node.id ? 'ring-4 ring-[rgb(249 115 22 / 0.3)] scale-150' : ''
                        )} />
                    </motion.div>
                ))}

                {/* Info HUD */}
                <div className="absolute top-6 left-6 flex flex-col gap-4 max-w-sm">
                    <Card className="p-4 bg-black/90 text-white border-white/10 backdrop-blur-md">
                        <div className="flex items-start gap-4">
                            <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                <Info className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm mb-1">Knowledge Graph Navigation</h3>
                                <p className="text-[10px] text-white/60 leading-relaxed">
                                    Drag nodes to reorganize your research space.
                                    Connections represent shared research domains or venues.
                                    Nodes are color-coded by Gap Type.
                                </p>
                            </div>
                        </div>
                    </Card>

                    {selectedGap && (
                        <motion.div
                            initial={{ x: -50, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <Card className="p-6 border-[rgb(249 115 22 / 0.2)] shadow-2xl">
                                <Badge className="mb-4 uppercase font-bold tracking-tighter" variant={selectedGap.type}>
                                    {selectedGap.type}
                                </Badge>
                                <h3 className="text-lg font-bold mb-4 leading-tight">
                                    {selectedGap.problem}
                                </h3>
                                <div className="space-y-4 pt-4 border-t border-[rgb(255 255 255 / 0.08)]">
                                    <div>
                                        <p className="text-[10px] text-[rgb(var(--text-secondary))] uppercase font-bold mb-1">Source Paper</p>
                                        <p className="text-xs font-medium">{selectedGap.paper}</p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">{selectedGap.impactScore} IMPACT</Badge>
                                            <Badge variant="outline" className="text-[10px]">{selectedGap.venue}</Badge>
                                        </div>
                                        <Button size="sm" className="h-8 gap-2">
                                            Details <Maximize2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    )
}
