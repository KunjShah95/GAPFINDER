import { motion } from "framer-motion"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/context/AuthContext"
import { getAccessToken } from "@/lib/api-client"
import {
  FileText,
  Lightbulb,
  TrendingUp,
  Users,
  Plus,
  ChevronRight,
  Calendar,
  Target,
  Zap,
  Brain,
  GitBranch,
  MessageSquare,
  Award,
  Activity
} from "lucide-react"
import { Link } from "react-router-dom"
import PrimeHero from "@/components/layout/PrimeHero"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FALLBACK_GAPS = [
  { id: "1", title: "Efficient long-context attention mechanisms", domain: "NLP", impact: "High", votes: 47 },
  { id: "2", title: "Robust few-shot learning under distribution shift", domain: "Computer Vision", impact: "High", votes: 38 },
  { id: "3", title: "Theoretical guarantees for diffusion models", domain: "Generative AI", impact: "Medium", votes: 29 },
  { id: "4", title: "Causal representation learning without supervision", domain: "Causality", impact: "High", votes: 25 },
]

const trendingPapers = [
  { id: "1", title: "Attention Is All You Need", citations: 125000, year: 2017 },
  { id: "2", title: "BERT: Pre-training of Deep Bidirectional Transformers", citations: 85000, year: 2018 },
  { id: "3", title: "GPT-4 Technical Report", citations: 12000, year: 2023 },
  { id: "4", title: "LLaMA: Open and Efficient Foundation Models", citations: 8500, year: 2023 },
]

const quickActions = [
  { label: "Analyze Paper", icon: FileText, path: "/papers" },
  { label: "Find Gaps", icon: Lightbulb, path: "/gaps" },
  { label: "Knowledge Graph", icon: Activity, path: "/knowledge-graph" },
  { label: "Workflows", icon: GitBranch, path: "/workflows" },
  { label: "Research Chat", icon: MessageSquare, path: "/chat" },
  { label: "Roadmap", icon: Calendar, path: "/roadmap" },
]

const achievements = [
  { id: "1", name: "First Gap Found", icon: Target, earned: true },
  { id: "2", name: "Gap Hunter", icon: Zap, earned: true },
  { id: "3", name: "Trendsetter", icon: TrendingUp, earned: false },
  { id: "4", name: "Researcher", icon: Brain, earned: false },
]

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<"week" | "month" | "year">("month")
  const { user } = useAuth()

  const periodDays = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview', periodDays],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch(`/api/analytics/overview?period=${periodDays}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json() as Promise<{
        papers: { total_papers: number; papers_this_week: number; unique_venues: number; avg_citations: number }
        gaps: { total_gaps: number; high_impact_gaps: number; resolved_gaps: number }
      }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: recentGapsData } = useQuery({
    queryKey: ['gaps-recent'],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch('/api/gaps?limit=4', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to fetch gaps')
      const data = await res.json() as { gaps: { id: string; problem: string; type: string; impact_score: string }[] }
      return data.gaps.map(g => ({
        id: g.id,
        title: g.problem ?? 'Untitled gap',
        domain: g.type ?? 'General',
        impact: g.impact_score ? g.impact_score.charAt(0).toUpperCase() + g.impact_score.slice(1) : 'Low',
        votes: 0,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })

  const statsCards = [
    {
      label: 'Papers Analyzed',
      value: overview ? overview.papers.total_papers.toLocaleString() : '—',
      change: overview ? `+${overview.papers.papers_this_week} this week` : 'Loading…',
      icon: FileText,
    },
    {
      label: 'Gaps Discovered',
      value: overview ? overview.gaps.total_gaps.toLocaleString() : '—',
      change: overview ? `${overview.gaps.resolved_gaps ?? 0} resolved` : 'Loading…',
      icon: Lightbulb,
    },
    {
      label: 'High-Impact Gaps',
      value: overview ? (overview.gaps.high_impact_gaps ?? 0).toLocaleString() : '—',
      change: overview ? `of ${overview.gaps.total_gaps} total` : 'Loading…',
      icon: TrendingUp,
    },
    {
      label: 'Unique Venues',
      value: overview ? overview.papers.unique_venues.toLocaleString() : '—',
      change: overview ? `avg ${overview.papers.avg_citations ?? 0} citations` : 'Loading…',
      icon: Users,
    },
  ]

  const recentGaps = recentGapsData ?? FALLBACK_GAPS

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "High": return "bg-red-500/10 text-red-500 border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
      case "Medium": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20"
      default: return "bg-muted text-muted-foreground border-border"
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* PRIME Header */}
      <PrimeHero />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {user?.name || "Researcher"}. Here's your research overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted border border-border rounded-xl p-1">
            {(["week", "month", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-all",
                  timeRange === range
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card card-hover p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/10">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickActions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <Link
              to={action.path}
              className="flex flex-col items-center gap-2 p-4 card card-hover text-center group"
            >
              <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium">{action.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Gaps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 card"
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Lightbulb className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Recent Research Gaps</h2>
                <p className="text-sm text-muted-foreground">Latest discoveries from your papers</p>
              </div>
            </div>
            <Link to="/gaps" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentGaps.map((gap) => (
              <div key={gap.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer group">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate group-hover:text-primary transition-colors">{gap.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs px-2 py-0.5 bg-muted rounded-md text-muted-foreground border border-border">
                      {gap.domain}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-md border ${getImpactColor(gap.impact)}`}>
                      {gap.impact} Impact
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Target className="w-4 h-4" />
                  <span>{gap.votes}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Achievements */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="card"
          >
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <Award className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Achievements</h2>
                <p className="text-sm text-muted-foreground">Your research milestones</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all",
                    achievement.earned
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-muted border-border opacity-60"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-lg w-fit",
                    achievement.earned ? "bg-amber-500/10" : "bg-muted"
                  )}>
                    <achievement.icon className={cn(
                      "w-4 h-4",
                      achievement.earned ? "text-amber-500" : "text-muted-foreground"
                    )} />
                  </div>
                  <p className="text-sm font-medium mt-2">{achievement.name}</p>
                  {achievement.earned && (
                    <p className="text-xs text-amber-500 mt-0.5 font-medium">Earned!</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Trending Papers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <div className="p-2 rounded-xl bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Trending Papers</h2>
                <p className="text-sm text-muted-foreground">Most discussed in your field</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {trendingPapers.map((paper, i) => (
                <div key={paper.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer group">
                  <span className="text-sm font-bold text-muted-foreground w-5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{paper.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {paper.year} · {paper.citations.toLocaleString()} citations
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
