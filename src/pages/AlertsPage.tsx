import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { getAccessToken } from "@/lib/api-client"
import { 
    Bell, 
    Plus, 
    Trash2, 
    Play, 
    Settings,
    Search,
    ExternalLink,
    Check,
    CheckCheck,
    AlertTriangle,
    Calendar,
    Mail,
    Smartphone,
    Newspaper,
    RefreshCw,
    Building2,
    ChevronLeft,
    ChevronRight,
    Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/AuthContext"
import { useAlerts, useNotifications, useMarkNotificationRead } from "@/hooks/useQueries"
import { queryClient } from "@/lib/query-client"
import { AlertCardSkeleton, NotificationSkeleton } from "@/components/ui/skeleton"

const PUBLISHER_COLORS: Record<string, string> = {
    arxiv:        'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300',
    pubmed:       'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300',
    crossref:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300',
    biorxiv:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300',
    nature:       'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300',
    plos:         'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-300',
    ieee:         'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-300',
    springer:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300',
}

export default function AlertsPage() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newAlert, setNewAlert] = useState({
        query: "",
        frequency: "weekly",
        sources: ["arxiv"],
        matchType: "keyword"
    })
    const [preferences, setPreferences] = useState({
        emailAlerts: true,
        pushAlerts: true,
        inAppAlerts: true,
        alertFrequency: "daily",
        notifyOnGaps: true,
        notifyOnPapers: true,
        notifyOnCommunity: true
    })

    // Latest Papers state
    const [selectedPublishers, setSelectedPublishers] = useState<string[]>([])
    const [latestSearch, setLatestSearch] = useState("")
    const [latestSearchInput, setLatestSearchInput] = useState("")
    const [latestPage, setLatestPage] = useState(1)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const togglePublisher = (id: string) => {
        setSelectedPublishers(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
        setLatestPage(1)
    }

    const { data: publishersData } = useQuery({
        queryKey: ['latest-papers-publishers'],
        queryFn: async () => {
            const token = getAccessToken()
            const res = await fetch('/api/latest-papers/publishers', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (!res.ok) throw new Error('Failed to fetch publishers')
            return res.json() as Promise<{
                publishers: { id: string; name: string; description: string; paperCount: number; allowedForTier: boolean }[]
                lastRun: { status: string; finished_at: string; papers_fetched: number } | null
            }>
        },
        staleTime: 5 * 60 * 1000,
    })

    const publisherParam = selectedPublishers.length > 0 ? selectedPublishers.join(',') : ''
    const { data: latestPapersData, isLoading: latestLoading, refetch: refetchLatest } = useQuery({
        queryKey: ['latest-papers', publisherParam, latestSearch, latestPage],
        queryFn: async () => {
            const params = new URLSearchParams()
            if (publisherParam) params.set('publisher', publisherParam)
            if (latestSearch) params.set('q', latestSearch)
            params.set('page', String(latestPage))
            params.set('limit', '20')
            const token = getAccessToken()
            const res = await fetch(`/api/latest-papers?${params.toString()}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (!res.ok) throw new Error('Failed to fetch latest papers')
            return res.json() as Promise<{
                papers: {
                    id: string; publisher: string; title: string; abstract: string;
                    url: string; authors: string[]; venue: string; year: number;
                    published_at: string;
                }[]
                pagination: { page: number; limit: number; total: number; totalPages: number }
            }>
        },
        enabled: !!user,
        staleTime: 2 * 60 * 1000,
    })

    const triggerRefresh = async () => {
        try {
            setIsRefreshing(true)
            const token = getAccessToken()
            await fetch('/api/latest-papers/refresh', {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            // Give the server a moment then re-fetch
            setTimeout(() => {
                refetchLatest()
                setIsRefreshing(false)
            }, 3000)
        } catch {
            setIsRefreshing(false)
        }
    }

    // Use TanStack Query hooks
    const { 
        data: alerts = [], 
        isLoading: alertsLoading,
        error: alertsError 
    } = useAlerts()

    const { 
        data: notificationsData = { notifications: [], unreadCount: 0 }, 
        isLoading: notificationsLoading 
    } = useNotifications()

    const { notifications, unreadCount } = notificationsData

    const markReadMutation = useMarkNotificationRead()

    const createAlert = async () => {
        if (!newAlert.query.trim()) return

        try {
            const response = await fetch("/api/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newAlert)
            })

            if (response.ok) {
                setNewAlert({ query: "", frequency: "weekly", sources: ["arxiv"], matchType: "keyword" })
                setShowCreateForm(false)
                // Invalidate alerts cache
                queryClient.invalidateQueries({ queryKey: ['alerts'] })
            }
        } catch (error) {
            console.error("Failed to create alert:", error)
        }
    }

    const deleteAlert = async (id: string) => {
        try {
            await fetch(`/api/alerts/${id}`, { method: "DELETE" })
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
        } catch (error) {
            console.error("Failed to delete alert:", error)
        }
    }

    const toggleAlert = async (id: string, isActive: boolean) => {
        try {
            await fetch(`/api/alerts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !isActive })
            })
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
        } catch (error) {
            console.error("Failed to toggle alert:", error)
        }
    }

    const testAlert = async (id: string) => {
        try {
            await fetch(`/api/alerts/${id}/test`, { method: "POST" })
            queryClient.invalidateQueries({ queryKey: ['alerts', 'notifications'] })
        } catch (error) {
            console.error("Failed to test alert:", error)
        }
    }

    const markAsRead = (id: string) => {
        markReadMutation.mutate(id)
    }

    const markAllAsRead = async () => {
        try {
            await fetch("/api/alerts/notifications/read-all", { method: "POST" })
            queryClient.invalidateQueries({ queryKey: ['alerts', 'notifications'] })
        } catch (error) {
            console.error("Failed to mark all as read:", error)
        }
    }

    const savePreferences = async () => {
        try {
            await fetch("/api/alerts/preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(preferences)
            })
        } catch (error) {
            console.error("Failed to save preferences:", error)
        }
    }

    const getFrequencyLabel = (freq: string) => {
        switch (freq) {
            case "daily": return "Daily"
            case "weekly": return "Weekly"
            case "monthly": return "Monthly"
            default: return freq
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
                    <div className="p-3 bg-gradient-to-br from-red-500 to-pink-500 rounded-xl">
                        <Bell className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold">Research Alerts</h1>
                        <p className="text-muted-foreground">
                            Get notified when new papers match your research interests
                        </p>
                    </div>
                    {unreadCount > 0 && (
                        <Badge variant="default" className="bg-red-500">
                            {unreadCount} unread
                        </Badge>
                    )}
                </div>

                <Tabs defaultValue="latest">
                    <TabsList>
                        <TabsTrigger value="latest" className="flex items-center gap-2">
                            <Newspaper className="w-4 h-4" />
                            Latest Papers
                        </TabsTrigger>
                        <TabsTrigger value="alerts" className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Alerts ({alerts.length})
                        </TabsTrigger>
                        <TabsTrigger value="notifications" className="flex items-center gap-2">
                            <Bell className="w-4 h-4" />
                            Notifications ({unreadCount})
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            Settings
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Latest Papers Tab ── */}
                    <TabsContent value="latest" className="space-y-4 mt-4">
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">Latest from Famous Publishers</h2>
                                <p className="text-sm text-muted-foreground">
                                    Updated daily at 06:00 UTC &mdash; arXiv, PubMed, CrossRef, bioRxiv, Nature, PLOS, IEEE &amp; Springer
                                </p>
                                {publishersData?.lastRun && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Last run: {new Date(publishersData.lastRun.finished_at).toLocaleString()}
                                        &nbsp;&bull;&nbsp;{publishersData.lastRun.papers_fetched} new papers
                                    </p>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={triggerRefresh}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {isRefreshing ? 'Refreshing…' : 'Refresh Now'}
                            </Button>
                        </div>

                        {/* Publisher filter chips */}
                        <div className="flex flex-wrap gap-2">
                            {(publishersData?.publishers ?? []).map(pub => {
                                const active = selectedPublishers.includes(pub.id) ||
                                    (selectedPublishers.length === 0)
                                return (
                                    <button
                                        key={pub.id}
                                        onClick={() => pub.allowedForTier ? togglePublisher(pub.id) : navigate('/pricing')}
                                        title={pub.allowedForTier ? pub.description : 'Upgrade your plan to unlock this publisher'}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-opacity
                                            ${pub.allowedForTier
                                                ? PUBLISHER_COLORS[pub.id] ?? 'bg-muted text-muted-foreground border-border'
                                                : 'bg-muted text-muted-foreground border-border'}
                                            ${pub.allowedForTier
                                                ? (selectedPublishers.length > 0 && !selectedPublishers.includes(pub.id) ? 'opacity-40' : 'opacity-100')
                                                : 'opacity-50 cursor-pointer'}`}
                                    >
                                        {pub.allowedForTier
                                            ? <Building2 className="w-3 h-3" />
                                            : <Lock className="w-3 h-3" />}
                                        {pub.name}
                                        {pub.allowedForTier && pub.paperCount > 0 && (
                                            <span className="opacity-70">({pub.paperCount})</span>
                                        )}
                                        {!pub.allowedForTier && (
                                            <span className="text-primary font-semibold">Pro</span>
                                        )}
                                    </button>
                                )
                            })}
                            {selectedPublishers.length > 0 && (
                                <button
                                    onClick={() => { setSelectedPublishers([]); setLatestPage(1); }}
                                    className="text-xs text-muted-foreground underline px-2"
                                >
                                    Clear filter
                                </button>
                            )}
                        </div>

                        {/* Search */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search titles and abstracts…"
                                    value={latestSearchInput}
                                    onChange={e => setLatestSearchInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            setLatestSearch(latestSearchInput)
                                            setLatestPage(1)
                                        }
                                    }}
                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                            <Button
                                size="sm"
                                onClick={() => { setLatestSearch(latestSearchInput); setLatestPage(1); }}
                            >
                                Search
                            </Button>
                            {latestSearch && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setLatestSearch(''); setLatestSearchInput(''); setLatestPage(1); }}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>

                        {/* Paper cards */}
                        {latestLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                                ))}
                            </div>
                        ) : !latestPapersData?.papers.length ? (
                            <Card className="p-12 text-center">
                                <Newspaper className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Papers Yet</h3>
                                <p className="text-muted-foreground mb-4">
                                    The cron job runs daily at 06:00 UTC. Click &ldquo;Refresh Now&rdquo; to fetch papers immediately.
                                </p>
                                <Button onClick={triggerRefresh} disabled={isRefreshing}>
                                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    Fetch Now
                                </Button>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {latestPapersData.papers.map(paper => (
                                    <Card key={paper.id} className="hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border
                                                            ${PUBLISHER_COLORS[paper.publisher] ?? 'bg-muted text-muted-foreground border-border'}`}>
                                                            <Building2 className="w-3 h-3" />
                                                            {paper.publisher.toUpperCase()}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {paper.venue}
                                                        </span>
                                                        {paper.year && (
                                                            <span className="text-xs text-muted-foreground">{paper.year}</span>
                                                        )}
                                                        {paper.published_at && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {new Date(paper.published_at).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <a
                                                        href={paper.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-medium hover:underline line-clamp-2"
                                                    >
                                                        {paper.title}
                                                    </a>
                                                    {paper.authors.length > 0 && (
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            {paper.authors.slice(0, 4).join(', ')}
                                                            {paper.authors.length > 4 && ` +${paper.authors.length - 4} more`}
                                                        </p>
                                                    )}
                                                    {paper.abstract && (
                                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                            {paper.abstract}
                                                        </p>
                                                    )}
                                                </div>
                                                <a
                                                    href={paper.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="shrink-0"
                                                >
                                                    <Button variant="ghost" size="icon">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </Button>
                                                </a>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {latestPapersData && latestPapersData.pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={latestPage <= 1}
                                    onClick={() => setLatestPage(p => p - 1)}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Page {latestPapersData.pagination.page} of {latestPapersData.pagination.totalPages}
                                    &nbsp;&bull;&nbsp;{latestPapersData.pagination.total.toLocaleString()} papers
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={latestPage >= latestPapersData.pagination.totalPages}
                                    onClick={() => setLatestPage(p => p + 1)}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="alerts" className="space-y-4 mt-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Your Alerts</h2>
                            <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                                <Plus className="w-4 h-4 mr-2" />
                                New Alert
                            </Button>
                        </div>

                        {showCreateForm && (
                            <Card className="p-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium">Search Query</label>
                                        <Input 
                                            placeholder="e.g., LLM alignment, transformer efficiency..."
                                            value={newAlert.query}
                                            onChange={(e) => setNewAlert({...newAlert, query: e.target.value})}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium">Frequency</label>
                                            <select 
                                                value={newAlert.frequency}
                                                onChange={(e) => setNewAlert({...newAlert, frequency: e.target.value})}
                                                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            >
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Sources</label>
                                            <select 
                                                value={newAlert.sources[0]}
                                                onChange={(e) => setNewAlert({...newAlert, sources: [e.target.value]})}
                                                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            >
                                                <option value="arxiv">arXiv</option>
                                                <option value="semantic_scholar">Semantic Scholar</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={createAlert}>Create Alert</Button>
                                        <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {alertsLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <AlertCardSkeleton key={i} />
                                ))}
                            </div>
                        ) : alerts.length === 0 && !showCreateForm ? (
                            <Card className="p-12 text-center">
                                <AlertTriangle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Alerts Yet</h3>
                                <p className="text-muted-foreground mb-4">
                                    Create an alert to get notified about new papers in your area of interest.
                                </p>
                                <Button onClick={() => setShowCreateForm(true)}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create Your First Alert
                                </Button>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {alerts.map((alert: any) => (
                                    <Card key={alert.id} className={`${!alert.is_active ? 'opacity-60' : ''}`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Search className="w-4 h-4 text-muted-foreground" />
                                                        <span className="font-medium">{alert.query}</span>
                                                        {!alert.is_active && (
                                                            <Badge variant="secondary">Paused</Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {getFrequencyLabel(alert.frequency)}
                                                        </span>
                                                        <span>{alert.sources.join(", ")}</span>
                                                        {alert.notification_count > 0 && (
                                                            <span>{alert.notification_count} notifications</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm"
                                                        onClick={() => testAlert(alert.id)}
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm"
                                                        onClick={() => toggleAlert(alert.id, alert.is_active)}
                                                    >
                                                        {alert.is_active ? "Pause" : "Resume"}
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm"
                                                        onClick={() => deleteAlert(alert.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="notifications" className="space-y-4 mt-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Recent Notifications</h2>
                            {unreadCount > 0 && (
                                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                                    <CheckCheck className="w-4 h-4 mr-2" />
                                    Mark all as read
                                </Button>
                            )}
                        </div>

                        {notificationsLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <NotificationSkeleton key={i} />
                                ))}
                            </div>
                        ) : notifications.length === 0 ? (
                            <Card className="p-12 text-center">
                                <Bell className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Notifications</h3>
                                <p className="text-muted-foreground">
                                    You'll see notifications here when new papers match your alerts.
                                </p>
                            </Card>
                        ) : (
                            <div className="space-y-2">
                                {notifications.map((notif: any) => (
                                    <Card 
                                        key={notif.id} 
                                        className={`${notif.is_read ? 'bg-muted/30' : 'bg-blue-50 dark:bg-blue-950/20'}`}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        {!notif.is_read && (
                                                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                                                        )}
                                                        <span className="font-medium">{notif.title}</span>
                                                    </div>
                                                    {notif.body && (
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            {notif.body}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                        <span>{new Date(notif.created_at).toLocaleString()}</span>
                                                        {notif.alert_query && (
                                                            <Badge variant="outline">Alert: {notif.alert_query}</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!notif.is_read && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm"
                                                            onClick={() => markAsRead(notif.id)}
                                                            disabled={markReadMutation.isPending}
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    {notif.paper_url && (
                                                        <a 
                                                            href={notif.paper_url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                        >
                                                            <Button variant="ghost" size="sm">
                                                                <ExternalLink className="w-4 h-4" />
                                                            </Button>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Preferences</CardTitle>
                                <CardDescription>Choose how you want to be notified</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3">
                                        <input 
                                            type="checkbox"
                                            checked={preferences.emailAlerts}
                                            onChange={(e) => setPreferences({...preferences, emailAlerts: e.target.checked})}
                                            className="rounded"
                                        />
                                        <Mail className="w-4 h-4" />
                                        Email notifications
                                    </label>
                                    <label className="flex items-center gap-3">
                                        <input 
                                            type="checkbox"
                                            checked={preferences.pushAlerts}
                                            onChange={(e) => setPreferences({...preferences, pushAlerts: e.target.checked})}
                                            className="rounded"
                                        />
                                        <Smartphone className="w-4 h-4" />
                                        Push notifications
                                    </label>
                                    <label className="flex items-center gap-3">
                                        <input 
                                            type="checkbox"
                                            checked={preferences.inAppAlerts}
                                            onChange={(e) => setPreferences({...preferences, inAppAlerts: e.target.checked})}
                                            className="rounded"
                                        />
                                        <Bell className="w-4 h-4" />
                                        In-app notifications
                                    </label>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Alert Frequency</label>
                                    <select 
                                        value={preferences.alertFrequency}
                                        onChange={(e) => setPreferences({...preferences, alertFrequency: e.target.value})}
                                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="instant">Instant</option>
                                        <option value="daily">Daily digest</option>
                                        <option value="weekly">Weekly digest</option>
                                    </select>
                                </div>

                                <Button onClick={savePreferences}>Save Preferences</Button>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    )
}
