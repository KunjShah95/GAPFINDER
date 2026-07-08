// Admin Dashboard Page
// SaaS Management interface for administrators

import { useState } from "react"
import { motion } from "framer-motion"
import {
    Users,
    CreditCard,
    TrendingUp,
    Activity,
    FileSearch,
    Crown,
    Download,
    RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/utils"

// Admin stats interface
interface AdminStats {
    totalUsers: number
    activeSubscriptions: number
    monthlyRevenue: number
    papersProcessedToday: number
    activeTrials: number
    churnRate: number
}

// User with subscription data
interface UserWithSubscription {
    id: string
    email: string
    name: string
    subscription: string
    usage: number
    lastActive: string
}

// Demo stats
const demoStats: AdminStats = {
    totalUsers: 1247,
    activeSubscriptions: 892,
    monthlyRevenue: 45600,
    papersProcessedToday: 342,
    activeTrials: 156,
    churnRate: 2.3,
}

// Demo users
const demoUsers: UserWithSubscription[] = [
    { id: "1", email: "researcher@stanford.edu", name: "Dr. Sarah Chen", subscription: "Pro", usage: 847, lastActive: "2 hours ago" },
    { id: "2", email: "student@mit.edu", name: "James Wilson", subscription: "Trial", usage: 156, lastActive: "5 mins ago" },
    { id: "3", email: "prof@berkeley.edu", name: "Dr. Emily Johnson", subscription: "Enterprise", usage: 2341, lastActive: "1 day ago" },
    { id: "4", email: "engineer@google.com", name: "Michael Brown", subscription: "Pro", usage: 512, lastActive: "3 hours ago" },
    { id: "5", email: "researcher@openai.com", name: "Lisa Wang", subscription: "Enterprise", usage: 1892, lastActive: "30 mins ago" },
]

export default function AdminPage() {
    const { user } = useAuth()
    const [stats] = useState<AdminStats>(demoStats)
    const [users] = useState<UserWithSubscription[]>(demoUsers)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // In production, check if user is admin
    const isAdmin = true // Demo: allow access

    if (!isAdmin || !user) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-[rgb(var(--text-secondary))]">Access denied. Admin privileges required.</p>
            </div>
        )
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        await new Promise(resolve => setTimeout(resolve, 1000))
        setIsRefreshing(false)
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                    <p className="text-[rgb(var(--text-secondary))]">Manage your GapMiner organization</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button>
                        <Download className="w-4 h-4 mr-2" />
                        Export Report
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-[rgb(var(--text-secondary))]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                            +156 this month
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                        <CreditCard className="h-4 w-4 text-[rgb(var(--text-secondary))]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.monthlyRevenue)}</div>
                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                            +18.2% from last month
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Papers Processed</CardTitle>
                        <FileSearch className="h-4 w-4 text-[rgb(var(--text-secondary))]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.papersProcessedToday.toLocaleString()}</div>
                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                            Today
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-[rgb(var(--text-secondary))]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.churnRate}%</div>
                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                            -0.5% from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity & Users */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Users */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {users.map((user) => (
                                <div key={user.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[rgb(249 115 22 / 0.1)] flex items-center justify-center">
                                            <span className="text-sm font-medium text-[rgb(251 146 60)]">
                                                {user.name.split(" ").map(n => n[0]).join("")}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{user.name}</p>
                                            <p className="text-xs text-[rgb(var(--text-secondary))]">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <Badge variant={user.subscription === "Enterprise" ? "default" : "secondary"}>
                                            {user.subscription}
                                        </Badge>
                                        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">{user.lastActive}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* System Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>System Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-[rgb(255 255 255 / 0.04)] rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Activity className="w-5 h-5 text-green-500" />
                                    <span className="text-sm">API Services</span>
                                </div>
                                <Badge className="bg-green-500/10 text-green-600">Operational</Badge>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-[rgb(255 255 255 / 0.04)] rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Activity className="w-5 h-5 text-green-500" />
                                    <span className="text-sm">Database</span>
                                </div>
                                <Badge className="bg-green-500/10 text-green-600">Connected</Badge>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-[rgb(255 255 255 / 0.04)] rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Activity className="w-5 h-5 text-yellow-500" />
                                    <span className="text-sm">AI Processing</span>
                                </div>
                                <Badge className="bg-yellow-500/10 text-yellow-600">High Load</Badge>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-[rgb(255 255 255 / 0.04)] rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Activity className="w-5 h-5 text-green-500" />
                                    <span className="text-sm">Email Service</span>
                                </div>
                                <Badge className="bg-green-500/10 text-green-600">Operational</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    )
}
