import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BookOpen,
  Users,
  Calendar,
  ExternalLink,
  ThumbsUp,
  Lightbulb,
  Brain,
  Zap,
  Target,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  TrendingUp,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001/api"

interface Gap {
  id: string
  problem: string
  type: string
  confidence?: number
  impact_score: string
  difficulty: string
  assumptions?: string
  failures?: string
  dataset_gaps?: string
  evaluation_critique?: string
  upvotes: number
  is_resolved: boolean
  created_at: string
}

interface Paper {
  id: string
  title: string
  abstract?: string
  authors: string[]
  venue?: string
  year?: number
  url?: string
  citation_count?: number
  created_at: string
  gaps: Gap[]
}

const impactColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
}

const difficultyColors: Record<string, string> = {
  expert: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  hard: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
  easy: "bg-green-500/10 text-green-600 border-green-500/20",
}

const typeIcons: Record<string, typeof Lightbulb> = {
  data: Target,
  methodology: Brain,
  theory: Lightbulb,
  evaluation: TrendingUp,
  compute: Zap,
  deployment: Tag,
}

export default function PaperDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [votingId, setVotingId] = useState<string | null>(null)

  const { data: paper, isLoading, error } = useQuery<Paper>({
    queryKey: ["paper", id],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/papers/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Failed to fetch paper")
      return res.json()
    },
    enabled: !!id,
  })

  const voteMutation = useMutation({
    mutationFn: async ({ gapId, vote }: { gapId: string; vote: 1 | -1 }) => {
      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/gaps/${gapId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ vote }),
      })
      if (!res.ok) throw new Error("Vote failed")
      return res.json() as Promise<{ upvotes: number }>
    },
    onMutate: ({ gapId }) => setVotingId(gapId),
    onSuccess: (data, { gapId }) => {
      queryClient.setQueryData<Paper>(["paper", id], (old) => {
        if (!old) return old
        return {
          ...old,
          gaps: old.gaps.map((g) =>
            g.id === gapId ? { ...g, upvotes: data.upvotes } : g
          ),
        }
      })
    },
    onSettled: () => setVotingId(null),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !paper) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-muted-foreground">Failed to load paper. It may not exist.</p>
        <Button onClick={() => navigate("/papers")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Papers
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-5xl"
    >
      {/* Back button */}
      <Button variant="ghost" onClick={() => navigate("/papers")} className="gap-2 -ml-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Papers
      </Button>

      {/* Paper header */}
      <div className="card p-8 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{paper.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
              {paper.authors?.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
                </span>
              )}
              {paper.year && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {paper.year}
                </span>
              )}
              {paper.venue && <span className="text-primary font-medium">{paper.venue}</span>}
              {paper.citation_count != null && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  {paper.citation_count.toLocaleString()} citations
                </span>
              )}
            </div>
          </div>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                View Paper
              </Button>
            </a>
          )}
        </div>

        {paper.abstract && (
          <div className="pt-4 border-t border-border">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Abstract</h2>
            <p className="text-sm leading-relaxed text-foreground/80">{paper.abstract}</p>
          </div>
        )}
      </div>

      {/* Gaps section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Research Gaps</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {paper.gaps.length} gap{paper.gaps.length !== 1 ? "s" : ""} identified
            </p>
          </div>
        </div>

        {paper.gaps.length === 0 ? (
          <div className="card p-12 text-center">
            <Lightbulb className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No research gaps have been identified for this paper yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paper.gaps.map((gap, index) => {
              const TypeIcon = typeIcons[gap.type] ?? Lightbulb
              return (
                <motion.div
                  key={gap.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="card p-6 space-y-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-primary/10 flex-shrink-0 mt-0.5">
                      <TypeIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-md border font-medium",
                          impactColors[gap.impact_score] ?? impactColors.low
                        )}>
                          {gap.impact_score} impact
                        </span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-md border",
                          difficultyColors[gap.difficulty] ?? ""
                        )}>
                          {gap.difficulty}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground capitalize">
                          {gap.type}
                        </span>
                        {gap.is_resolved && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-500/10 text-green-600 border border-green-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-base font-medium leading-relaxed">{gap.problem}</p>
                    </div>
                    <button
                      onClick={() => voteMutation.mutate({ gapId: gap.id, vote: 1 })}
                      disabled={votingId === gap.id}
                      className={cn(
                        "flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all flex-shrink-0",
                        "hover:bg-primary/10 hover:border-primary/50 hover:text-primary",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "border-border text-muted-foreground"
                      )}
                    >
                      {votingId === gap.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="w-4 h-4" />
                      )}
                      <span className="text-xs font-medium">{gap.upvotes}</span>
                    </button>
                  </div>

                  {/* Extra details if available */}
                  {(gap.assumptions || gap.failures || gap.dataset_gaps || gap.evaluation_critique) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border">
                      {gap.assumptions && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assumptions</p>
                          <p className="text-sm text-foreground/70">{gap.assumptions}</p>
                        </div>
                      )}
                      {gap.failures && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Known Failures</p>
                          <p className="text-sm text-foreground/70">{gap.failures}</p>
                        </div>
                      )}
                      {gap.dataset_gaps && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dataset Gaps</p>
                          <p className="text-sm text-foreground/70">{gap.dataset_gaps}</p>
                        </div>
                      )}
                      {gap.evaluation_critique && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Evaluation Critique</p>
                          <p className="text-sm text-foreground/70">{gap.evaluation_critique}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {gap.confidence != null && (
                    <div className="flex items-center gap-2 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">Confidence</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.round(gap.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{Math.round(gap.confidence * 100)}%</span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
