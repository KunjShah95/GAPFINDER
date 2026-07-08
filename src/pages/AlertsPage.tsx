import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  Plus,
  Search,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  BellOff,
  Calendar,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Alert {
  id: string
  query: string
  frequency: "daily" | "weekly" | "monthly"
  sources: string[]
  match_type: string
  is_active: boolean
  notification_count: number
  unread_count: number
  last_triggered_at?: string
  created_at: string
}

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const

const MATCH_TYPES = [
  { value: "keyword", label: "Keyword" },
  { value: "author", label: "Author" },
  { value: "venue", label: "Venue" },
] as const

export default function AlertsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [alertQuery, setAlertQuery] = useState("")
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly")
  const [matchType, setMatchType] = useState<"keyword" | "author" | "venue">("keyword")
  const [sources, setSources] = useState({ arxiv: true, semantic_scholar: false })
  const [formError, setFormError] = useState("")

  const { data, isLoading, error } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["alerts"],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch("/api/alerts", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Failed to fetch alerts")
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: async (body: { query: string; frequency: string; sources: string[]; matchType: string }) => {
      const token = getAccessToken()
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || "Failed to create alert")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      setShowCreate(false)
      setAlertQuery("")
      setFrequency("weekly")
      setMatchType("keyword")
      setSources({ arxiv: true, semantic_scholar: false })
      setFormError("")
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const handleCreate = () => {
    if (!alertQuery.trim()) { setFormError("Alert query is required"); return }
    const selectedSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k)
    if (selectedSources.length === 0) { setFormError("Select at least one source"); return }
    createMutation.mutate({ query: alertQuery.trim(), frequency, matchType, sources: selectedSources })
  }

  const alerts = data?.alerts ?? []
  const filtered = alerts.filter(a =>
    !searchQuery || a.query.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const frequencyColor = (f: string) => ({
    daily: "bg-red-500/10 text-red-500 border-red-500/20",
    weekly: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    monthly: "bg-green-500/10 text-green-600 border-green-500/20",
  }[f] ?? "bg-muted text-muted-foreground border-border")

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Research Alerts</h1>
          <p className="text-muted-foreground mt-1">Stay updated on new research matching your interests</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Alert
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Alerts", value: alerts.length, icon: Bell },
          { label: "Active", value: alerts.filter(a => a.is_active).length, icon: Zap },
          { label: "Unread", value: alerts.reduce((s, a) => s + (a.unread_count ?? 0), 0), icon: Bell },
          { label: "This Week", value: alerts.filter(a => a.frequency === "weekly").length, icon: Calendar },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-5 cursor-default">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
              <div className="p-2 rounded-xl bg-primary/10">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search alerts..."
          className="w-full pl-12 pr-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">New Alert</h2>
                <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Query *</label>
                  <input
                    value={alertQuery}
                    onChange={(e) => setAlertQuery(e.target.value)}
                    placeholder="e.g. transformer attention mechanisms"
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Frequency</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Match Type</label>
                    <select
                      value={matchType}
                      onChange={(e) => setMatchType(e.target.value as typeof matchType)}
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Sources</label>
                  <div className="flex gap-3">
                    {[{ key: "arxiv", label: "arXiv" }, { key: "semantic_scholar", label: "Semantic Scholar" }].map(s => (
                      <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sources[s.key as keyof typeof sources]}
                          onChange={(e) => setSources(prev => ({ ...prev, [s.key]: e.target.checked }))}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                  Create Alert
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="glass-card p-12 text-center space-y-3 cursor-default">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-muted-foreground">Failed to load alerts. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4 cursor-default">
          <Bell className="w-16 h-16 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-lg font-medium">No alerts yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create an alert to get notified about new research matching your query.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Alert
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert, index) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-card p-5 cursor-default"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn("p-2.5 rounded-xl flex-shrink-0", alert.is_active ? "bg-primary/10" : "bg-muted")}>
                    {alert.is_active ? (
                      <Bell className="w-5 h-5 text-primary" />
                    ) : (
                      <BellOff className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{alert.query}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className={cn("text-xs px-2 py-0.5 rounded-md border font-medium capitalize", frequencyColor(alert.frequency))}>
                        {alert.frequency}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground capitalize">
                        {alert.match_type}
                      </span>
                      {alert.sources?.map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {alert.unread_count > 0 && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {alert.unread_count}
                    </span>
                  )}
                  {alert.is_active ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-2 ml-auto" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground mt-2 ml-auto" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                <span>{alert.notification_count ?? 0} notifications total</span>
                {alert.last_triggered_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last: {new Date(alert.last_triggered_at).toLocaleDateString()}
                  </span>
                )}
                <span className="flex items-center gap-1 ml-auto">
                  <Calendar className="w-3 h-3" />
                  Created {new Date(alert.created_at).toLocaleDateString()}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
