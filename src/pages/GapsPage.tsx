import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { motion } from "framer-motion"
import {
  Lightbulb,
  Search,
  Filter,
  TrendingUp,
  Target,
  Brain,
  Zap,
  ChevronRight,
  Star,
  Plus,
  Tag,
  Calendar,
  Users,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  ThumbsUp,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ApiGap {
  id: string
  paper_id: string
  problem: string
  type: string
  confidence?: number
  impact_score: string
  difficulty: string
  is_resolved?: boolean
  paper_title?: string
  upvotes?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All Gaps',
  data: 'Data Gaps',
  methodology: 'Methodology',
  theory: 'Theoretical',
  evaluation: 'Evaluation',
  compute: 'Compute',
  deployment: 'Deployment',
}

const impactColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
}

const difficultyColors: Record<string, string> = {
  expert: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  hard: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-green-500/10 text-green-600 border-green-500/20",
  easy: "bg-green-500/10 text-green-600 border-green-500/20",
}

export default function GapsPage() {
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const queryClient = useQueryClient()
  const [votingId, setVotingId] = useState<string | null>(null)

  const voteMutation = useMutation({
    mutationFn: async ({ gapId, vote }: { gapId: string; vote: 1 | -1 }) => {
      const token = getAccessToken()
      const res = await fetch(`/api/gaps/${gapId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ vote }),
      })
      if (!res.ok) throw new Error('Vote failed')
      return res.json() as Promise<{ upvotes: number }>
    },
    onMutate: ({ gapId }) => setVotingId(gapId),
    onSuccess: (data, { gapId }) => {
      queryClient.setQueryData<{ gaps: ApiGap[]; pagination: { total: number } }>(
        ['gaps', selectedCategory],
        (old) => {
          if (!old) return old
          return {
            ...old,
            gaps: old.gaps.map((g) => g.id === gapId ? { ...g, upvotes: data.upvotes } : g),
          }
        }
      )
    },
    onSettled: () => setVotingId(null),
  })

  const { data: gapsData } = useQuery({
    queryKey: ['gaps', selectedCategory],
    queryFn: async () => {
      const token = getAccessToken()
      const params = new URLSearchParams({ limit: '20' })
      if (selectedCategory !== 'all') params.set('type', selectedCategory)
      const res = await fetch(`/api/gaps?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to fetch gaps')
      return res.json() as Promise<{ gaps: ApiGap[]; pagination: { total: number } }>
    },
    staleTime: 2 * 60 * 1000,
  })

  const allGaps = gapsData?.gaps ?? []
  const totalCount = gapsData?.pagination.total ?? 0

  const filteredGaps = useMemo(() => {
    if (!searchQuery) return allGaps
    const q = searchQuery.toLowerCase()
    return allGaps.filter(g =>
      g.problem.toLowerCase().includes(q) ||
      (g.paper_title ?? '').toLowerCase().includes(q)
    )
  }, [allGaps, searchQuery])

  const gapCategories = useMemo(() => [
    { id: 'all', label: 'All Gaps', count: totalCount },
    ...Object.entries(CATEGORY_LABELS)
      .filter(([id]) => id !== 'all')
      .map(([id, label]) => ({
        id,
        label,
        count: allGaps.filter(g => g.type === id).length,
      }))
      .filter(c => c.count > 0),
  ], [allGaps, totalCount])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Research Gaps</h1>
          <p className="text-sm text-muted-foreground mt-1">Discover and prioritize research opportunities</p>
        </div>
        <Button className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Propose New Gap
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Gaps", value: totalCount.toString(), icon: Lightbulb, color: "primary" },
          { label: "High Impact", value: allGaps.filter(g => g.impact_score === 'high').length.toString(), icon: TrendingUp, color: "red" },
          { label: "Active Research", value: allGaps.filter(g => !g.is_resolved).length.toString(), icon: Zap, color: "yellow" },
          { label: "Resolved", value: allGaps.filter(g => g.is_resolved).length.toString(), icon: Users, color: "blue" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card card-hover p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={cn(
                "p-3 rounded-xl",
                stat.color === "primary" && "bg-primary/10 text-primary",
                stat.color === "red" && "bg-red-500/10 text-red-500",
                stat.color === "yellow" && "bg-yellow-500/10 text-yellow-600",
                stat.color === "blue" && "bg-blue-500/10 text-blue-500"
              )}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search gaps by title, domain, or keyword..."
            className="w-full pl-12 pr-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 flex-1 sm:flex-none">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button variant="outline" className="gap-2 flex-1 sm:flex-none">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Sort
          </Button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {gapCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-all border",
              selectedCategory === category.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/50"
            )}
          >
            <span className="font-medium">{category.label}</span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              selectedCategory === category.id ? "bg-primary-foreground/20" : "bg-muted"
            )}>
              {category.count}
            </span>
          </button>
        ))}
      </div>

      {/* Gaps Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredGaps.map((gap, index) => (
          <motion.div
            key={gap.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="card card-hover p-6 group cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-md border ${impactColors[gap.impact_score] ?? impactColors.low}`}>
                    {gap.impact_score} impact
                  </span>
                  <span className="text-xs text-muted-foreground">{gap.paper_title ?? gap.type}</span>
                </div>
                <h3 className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-2">
                  {gap.problem.length > 100 ? gap.problem.slice(0, 100) + '…' : gap.problem}
                </h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {gap.problem}
                </p>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Brain className="w-4 h-4" />
                    <span className={`text-xs px-2 py-0.5 rounded-md border ${difficultyColors[gap.difficulty] ?? ''}`}>
                      {gap.difficulty}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                  <ArrowUpRight className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); voteMutation.mutate({ gapId: gap.id, vote: 1 }) }}
                  disabled={votingId === gap.id}
                  className={cn(
                    "flex items-center gap-1 p-2 rounded-lg border transition-all",
                    "hover:bg-primary/10 hover:border-primary/50 hover:text-primary",
                    "text-muted-foreground border-border text-sm",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {votingId === gap.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ThumbsUp className="w-4 h-4" />
                  }
                  <span className="text-xs">{gap.upvotes ?? 0}</span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">{gap.type}</span>
              </div>
              <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium">
                View Details <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
