import { useState } from "react"
import { motion } from "framer-motion"
import { 
    Trophy, 
    Medal, 
    Crown, 
    Users, 
    TrendingUp,
    Calendar,
    Award,
    UserPlus,
    Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { useLeaderboard, useCommunityGaps } from "@/hooks/useQueries"
import { LeaderboardSkeleton, ListSkeleton } from "@/components/ui/skeleton"

export default function LeaderboardPage() {
    const { user } = useAuth()
    const [period, setPeriod] = useState<"weekly" | "monthly" | "all_time">("all_time")
    const [filterType, setFilterType] = useState<string>("")
    const [searchQuery, setSearchQuery] = useState("")

    // Use TanStack Query hooks for data fetching with caching
    const { 
        data: leaderboard = [], 
        isLoading: leaderboardLoading,
        error: leaderboardError 
    } = useLeaderboard(period)

    const { 
        data: communityGaps = [], 
        isLoading: gapsLoading,
        error: gapsError 
    } = useCommunityGaps({ type: filterType, sort: "upvotes" })

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return <Crown className="w-6 h-6 text-yellow-500" />
            case 2: return <Medal className="w-6 h-6 text-gray-400" />
            case 3: return <Medal className="w-6 h-6 text-amber-600" />
            default: return <span className="text-lg font-bold text-muted-foreground">{rank}</span>
        }
    }

    const getRankBg = (rank: number) => {
        switch (rank) {
            case 1: return "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200"
            case 2: return "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200"
            case 3: return "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200"
            default: return ""
        }
    }

    const filteredGaps = communityGaps.filter((gap: any) => 
        gap.problem.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gap.paper_title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const isLoading = leaderboardLoading || gapsLoading

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl">
                        <Trophy className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Community Leaderboard</h1>
                        <p className="text-muted-foreground">
                            Top researchers sharing and solving research gaps
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="leaderboard" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="leaderboard" className="flex items-center gap-2">
                            <Trophy className="w-4 h-4" />
                            Leaderboard
                        </TabsTrigger>
                        <TabsTrigger value="gaps" className="flex items-center gap-2">
                            <Award className="w-4 h-4" />
                            Community Gaps
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="leaderboard" className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Button
                                variant={period === "weekly" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPeriod("weekly")}
                            >
                                <Calendar className="w-4 h-4 mr-1" />
                                This Week
                            </Button>
                            <Button
                                variant={period === "monthly" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPeriod("monthly")}
                            >
                                <Calendar className="w-4 h-4 mr-1" />
                                This Month
                            </Button>
                            <Button
                                variant={period === "all_time" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPeriod("all_time")}
                            >
                                <Award className="w-4 h-4 mr-1" />
                                All Time
                            </Button>
                        </div>

                        {leaderboardLoading ? (
                            <LeaderboardSkeleton />
                        ) : leaderboardError ? (
                            <div className="text-center py-12 text-red-500">
                                Failed to load leaderboard
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {leaderboard.map((entry: any) => (
                                    <motion.div
                                        key={entry.user_id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: entry.rank * 0.05 }}
                                    >
                                        <Card className={`${getRankBg(entry.rank)} transition-all hover:shadow-md`}>
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 flex justify-center">
                                                        {getRankIcon(entry.rank)}
                                                    </div>
                                                    
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-bold">
                                                        {entry.avatar_url ? (
                                                            <img src={entry.avatar_url} alt={entry.name} className="w-full h-full rounded-full object-cover" />
                                                        ) : (
                                                            entry.name.charAt(0).toUpperCase()
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold truncate">{entry.name}</div>
                                                        {entry.institution && (
                                                            <div className="text-sm text-muted-foreground truncate">
                                                                {entry.institution}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-6">
                                                        <div className="text-center">
                                                            <div className="text-lg font-bold">{entry.shared_gaps}</div>
                                                            <div className="text-xs text-muted-foreground">Gaps</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-lg font-bold text-green-600">+{entry.total_upvotes}</div>
                                                            <div className="text-xs text-muted-foreground">Upvotes</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-lg font-bold">{entry.total_views}</div>
                                                            <div className="text-xs text-muted-foreground">Views</div>
                                                        </div>
                                                    </div>

                                                    {user && user.id !== entry.user_id && (
                                                        <Button variant="outline" size="sm">
                                                            <UserPlus className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}

                                {leaderboard.length === 0 && (
                                    <Card className="p-12 text-center">
                                        <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">No Users Yet</h3>
                                        <p className="text-muted-foreground">
                                            Be the first to share research gaps and top the leaderboard!
                                        </p>
                                    </Card>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="gaps" className="space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search gaps..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <select 
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">All Types</option>
                                <option value="data">Data</option>
                                <option value="compute">Compute</option>
                                <option value="evaluation">Evaluation</option>
                                <option value="theory">Theory</option>
                                <option value="deployment">Deployment</option>
                                <option value="methodology">Methodology</option>
                            </select>
                        </div>

                        {gapsLoading ? (
                            <ListSkeleton count={6} />
                        ) : (
                            <div className="grid gap-4">
                                {filteredGaps.map((gap: any) => (
                                    <Card key={gap.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                        <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 pb-4">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-base line-clamp-2">{gap.problem}</CardTitle>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <span>{gap.paper_title}</span>
                                                        {gap.venue && <span>• {gap.venue}</span>}
                                                        {gap.year && <span>• {gap.year}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge variant="outline">{gap.type}</Badge>
                                                    <Badge variant={gap.impact_score === "high" ? "default" : "secondary"}>
                                                        {gap.impact_score} impact
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-4">
                                            {gap.share_reason && (
                                                <p className="text-sm text-muted-foreground mb-3 italic">
                                                    "{gap.share_reason}"
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-1">
                                                        <TrendingUp className="w-4 h-4 text-green-500" />
                                                        <span className="font-semibold">{gap.upvotes}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Users className="w-4 h-4" />
                                                        <span>{gap.view_count} views</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                                                        {gap.author_name.charAt(0)}
                                                    </div>
                                                    <span className="text-sm">{gap.author_name}</span>
                                                    {gap.author_institution && (
                                                        <span className="text-xs text-muted-foreground">
                                                            @ {gap.author_institution}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}

                                {filteredGaps.length === 0 && (
                                    <Card className="p-12 text-center">
                                        <Award className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">No Gaps Shared</h3>
                                        <p className="text-muted-foreground">
                                            Share your first research gap with the community!
                                        </p>
                                    </Card>
                                )}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    )
}
