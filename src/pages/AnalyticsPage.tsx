import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { BarChart3, TrendingUp, Activity } from "lucide-react"

export default function AnalyticsPage() {
  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch('/api/analytics/overview?period=30', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json() as Promise<{
        papers: { total_papers: number; papers_this_week: number; avg_citations: number }
        gaps: { total_gaps: number; resolved_gaps: number }
      }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const metrics = [
    { label: "Papers Analyzed", value: overview ? overview.papers.total_papers.toLocaleString() : '—', change: overview ? `+${overview.papers.papers_this_week} this week` : 'Loading…', trend: "up" },
    { label: "Gaps Found", value: overview ? overview.gaps.total_gaps.toLocaleString() : '—', change: overview ? `${overview.gaps.resolved_gaps ?? 0} resolved` : 'Loading…', trend: "up" },
    { label: "Avg Citations", value: overview ? (overview.papers.avg_citations ?? 0).toLocaleString() : '—', change: "per paper", trend: "up" },
    { label: "Workflows Run", value: "—", change: "coming soon", trend: "up" },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Analytics</h1>
        <p className="text-slate-400 mt-1">Track your research productivity and impact</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{metric.label}</p>
                <p className="text-3xl font-bold mt-1">{metric.value}</p>
                <p className="text-sm text-emerald-400 mt-1">{metric.change}</p>
              </div>
              <Activity className="w-8 h-8 text-violet-400 opacity-50" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Activity Over Time</h2>
        <div className="h-64 flex items-center justify-center text-slate-500">Chart Visualization</div>
      </div>
    </motion.div>
  )
}
