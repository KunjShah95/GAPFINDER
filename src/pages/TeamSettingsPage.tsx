// Team Settings Page
// Manage team members, invites, roles, and team configuration

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Users,
    UserPlus,
    Settings,
    Mail,
    Shield,
    Crown,
    MoreVertical,
    Copy,
    Check,
    X,
    Clock,
    Trash2,
    Building2,
    Activity,
    AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useTeam } from "@/context/TeamContext"
import { useAuth } from "@/context/AuthContext"
import {
    createTeam,
    createInvite,
    getPendingInvites,
    revokeInvite,
    removeTeamMember,
    updateMemberRole,
    getAuditLogs,
    getRoleDisplayName,
    getRoleBadgeColor,
    type TeamInvite,
    type TeamRole,
    type AuditLogEntry,
} from "@/lib/team"

export function TeamSettingsPage() {
    const { user } = useAuth()
    const {
        currentTeam,
        members,
        can,
        refreshMembers,
        refreshTeams,
        teams,
    } = useTeam()

    const [activeTab, setActiveTab] = useState<"members" | "invites" | "settings" | "audit">("members")
    const [invites, setInvites] = useState<TeamInvite[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Create team modal state
    const [newTeamName, setNewTeamName] = useState("")

    // Invite modal state
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<TeamRole>("member")
    const [inviteLink, setInviteLink] = useState("")
    const [copied, setCopied] = useState(false)

    // Load team data
    useEffect(() => {
        if (currentTeam?.id) {
            loadTeamData()
        }
    }, [currentTeam?.id])

    async function loadTeamData() {
        if (!currentTeam?.id) return
        setIsLoading(true)
        try {
            const [invitesData, logsData] = await Promise.all([
                getPendingInvites(currentTeam.id),
                can("canViewAuditLog") ? getAuditLogs(currentTeam.id) : Promise.resolve([]),
            ])
            setInvites(invitesData)
            setAuditLogs(logsData)
        } catch (error) {
            console.error("Failed to load team data:", error)
        } finally {
            setIsLoading(false)
        }
    }

    // Create new team
    async function handleCreateTeam() {
        if (!user || !newTeamName.trim()) return
        setIsLoading(true)
        try {
            await createTeam(newTeamName.trim(), user.id, user.email || "", user.name || user.email || "")
            await refreshTeams()
            setNewTeamName("")
        } catch (error) {
            console.error("Failed to create team:", error)
        } finally {
            setIsLoading(false)
        }
    }

    // Send invite
    async function handleSendInvite() {
        if (!currentTeam?.id || !user || !inviteEmail.trim()) return
        setIsLoading(true)
        try {
            const invite = await createInvite(currentTeam.id, inviteEmail.trim(), inviteRole, user.id)
            const link = `${window.location.origin}/invite/${invite.token}`
            setInviteLink(link)
            setInvites(prev => [invite, ...prev])
            setInviteEmail("")
        } catch (error) {
            console.error("Failed to send invite:", error)
        } finally {
            setIsLoading(false)
        }
    }

    // Copy invite link
    function handleCopyLink() {
        navigator.clipboard.writeText(inviteLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // Revoke invite
    async function handleRevokeInvite(inviteId: string) {
        if (!currentTeam?.id || !user) return
        try {
            await revokeInvite(inviteId, currentTeam.id, user.id)
            setInvites(prev => prev.filter(i => i.id !== inviteId))
        } catch (error) {
            console.error("Failed to revoke invite:", error)
        }
    }

    // Remove member
    async function handleRemoveMember(memberId: string) {
        if (!currentTeam?.id || !user) return
        if (!confirm("Are you sure you want to remove this member?")) return
        try {
            await removeTeamMember(currentTeam.id, memberId, user.id)
            await refreshMembers()
        } catch (error) {
            console.error("Failed to remove member:", error)
        }
    }

    // Change role
    async function handleChangeRole(memberId: string, newRole: TeamRole) {
        if (!currentTeam?.id || !user) return
        try {
            await updateMemberRole(currentTeam.id, memberId, newRole, user.id)
            await refreshMembers()
        } catch (error) {
            console.error("Failed to change role:", error)
        }
    }

    // No team selected or created
    if (!currentTeam && teams.length === 0) {
        return (
            <div className="min-h-screen py-12">
                <div className="container-wide max-w-2xl mx-auto">
                    <Card>
                        <CardContent className="pt-12 pb-12 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[rgb(249 115 22)] to-[rgb(245 158 11)] flex items-center justify-center mx-auto mb-6">
                                <Building2 className="h-8 w-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Create Your First Team</h2>
                            <p className="text-[rgb(var(--text-secondary))] mb-8 max-w-md mx-auto">
                                Teams let you collaborate with colleagues, share research, and manage access together.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                                <Input
                                    placeholder="Team name..."
                                    value={newTeamName}
                                    onChange={(e) => setNewTeamName(e.target.value)}
                                    className="flex-1"
                                />
                                <Button
                                    onClick={handleCreateTeam}
                                    disabled={!newTeamName.trim() || isLoading}
                                    className="gap-2"
                                >
                                    <Users className="h-4 w-4" />
                                    Create Team
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                {/* Header */}
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <div className="section-number mb-4">TEAM</div>
                        <h1 className="heading-section mb-4">
                            {currentTeam?.name || "Team"}
                            <br />
                            <span className="gradient-text">Settings</span>
                        </h1>
                        <p className="text-lg text-[rgb(var(--text-secondary))] max-w-2xl">
                            Manage team members, roles, and collaboration settings.
                        </p>
                    </div>
                    {can("canInviteMembers") && (
                        <Button className="gap-2" onClick={() => setShowInviteModal(true)}>
                            <UserPlus className="h-4 w-4" />
                            Invite Members
                        </Button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-lg bg-[rgb(255 255 255 / 0.06)] w-fit mb-8">
                    {[
                        { id: "members", label: "Members", icon: Users },
                        { id: "invites", label: "Invites", icon: Mail, show: can("canInviteMembers") },
                        { id: "settings", label: "Settings", icon: Settings, show: can("canManageTeam") },
                        { id: "audit", label: "Activity", icon: Activity, show: can("canViewAuditLog") },
                    ].filter(t => t.show !== false).map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? "bg-[rgb(var(--text-primary))] text-[rgb(var(--text-primary))] shadow-sm"
                                    : "text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]"
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* Members Tab */}
                {activeTab === "members" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Team Members ({members.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {members.map((member, idx) => (
                                    <motion.div
                                        key={member.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex items-center justify-between p-4 rounded-lg border border-[rgb(255 255 255 / 0.08)] hover:bg-[rgb(255 255 255 / 0.06)]/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="h-10 w-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-medium"
                                                style={{
                                                    background: `linear-gradient(135deg, ${getRoleBadgeColor(member.role)}, hsl(var(--brand-secondary)))`,
                                                }}
                                            >
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium flex items-center gap-2">
                                                    {member.name}
                                                    {member.role === "owner" && (
                                                        <Crown className="h-4 w-4 text-yellow-500" />
                                                    )}
                                                </p>
                                                <p className="text-sm text-[rgb(var(--text-secondary))]">
                                                    {member.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge
                                                style={{ backgroundColor: getRoleBadgeColor(member.role) + "20", color: getRoleBadgeColor(member.role) }}
                                            >
                                                <Shield className="h-3 w-3 mr-1" />
                                                {getRoleDisplayName(member.role)}
                                            </Badge>
                                            {can("canManageMembers") && member.role !== "owner" && member.userId !== user?.id && (
                                                <div className="relative group">
                                                    <Button variant="ghost" size="sm">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                    <div className="absolute right-0 top-full mt-1 py-1 w-40 bg-[rgb(var(--text-primary))] border border-[rgb(255 255 255 / 0.08)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                                        {(["admin", "member", "viewer"] as TeamRole[]).map(role => (
                                                            <button
                                                                key={role}
                                                                onClick={() => handleChangeRole(member.id!, role)}
                                                                className="w-full px-3 py-2 text-left text-sm hover:bg-[rgb(255 255 255 / 0.06)] transition-colors"
                                                            >
                                                                Make {getRoleDisplayName(role)}
                                                            </button>
                                                        ))}
                                                        <hr className="my-1 border-[rgb(255 255 255 / 0.08)]" />
                                                        <button
                                                            onClick={() => handleRemoveMember(member.id!)}
                                                            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Invites Tab */}
                {activeTab === "invites" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="h-5 w-5" />
                                Pending Invites ({invites.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {invites.length === 0 ? (
                                <div className="text-center py-12 text-[rgb(var(--text-secondary))]">
                                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No pending invites</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {invites.map((invite, idx) => (
                                        <motion.div
                                            key={invite.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="flex items-center justify-between p-4 rounded-lg border border-[rgb(255 255 255 / 0.08)]"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-[rgb(255 255 255 / 0.06)] flex items-center justify-center">
                                                    <Mail className="h-5 w-5 text-[rgb(var(--text-secondary))]" />
                                                </div>
                                                <div>
                                                    <p className="font-medium">{invite.email}</p>
                                                    <p className="text-sm text-[rgb(var(--text-secondary))] flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Expires {invite.expiresAt.toDate().toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="secondary">
                                                    {getRoleDisplayName(invite.role)}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRevokeInvite(invite.id!)}
                                                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Audit Tab */}
                {activeTab === "audit" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                Activity Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {auditLogs.length === 0 ? (
                                <div className="text-center py-12 text-[rgb(var(--text-secondary))]">
                                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No activity yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {auditLogs.map((log, idx) => (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgb(255 255 255 / 0.06)]/50 transition-colors"
                                        >
                                            <div className="h-8 w-8 rounded-full bg-[rgb(255 255 255 / 0.06)] flex items-center justify-center">
                                                <Activity className="h-4 w-4 text-[rgb(var(--text-secondary))]" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm">
                                                    <span className="font-medium">{log.action.replace(".", " ").replace("_", " ")}</span>
                                                </p>
                                                <p className="text-xs text-[rgb(var(--text-secondary))]">
                                                    {log.createdAt.toDate().toLocaleString()}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Settings Tab */}
                {activeTab === "settings" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Team Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="p-4 rounded-lg border border-[rgb(255 255 255 / 0.08)]">
                                    <h3 className="font-medium mb-2">Team Name</h3>
                                    <Input defaultValue={currentTeam?.name} className="max-w-md" />
                                </div>
                                <div className="p-4 rounded-lg border border-[rgb(255 255 255 / 0.08)]">
                                    <h3 className="font-medium mb-2">Default Role for New Members</h3>
                                    <select className="px-3 py-2 rounded-lg border border-[rgb(255 255 255 / 0.08)] bg-[rgb(var(--text-primary))]">
                                        <option value="member">Member</option>
                                        <option value="viewer">Viewer</option>
                                    </select>
                                </div>
                                <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                                        <div>
                                            <h3 className="font-medium text-red-500">Danger Zone</h3>
                                            <p className="text-sm text-[rgb(var(--text-secondary))] mb-4">
                                                Deleting a team is permanent and cannot be undone.
                                            </p>
                                            <Button variant="destructive" size="sm">
                                                Delete Team
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Invite Modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => {
                                setShowInviteModal(false)
                                setInviteLink("")
                            }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative z-10 w-full max-w-md mx-4 bg-[rgb(var(--text-primary))] rounded-2xl border border-[rgb(255 255 255 / 0.08)] shadow-xl p-6"
                        >
                            <button
                                onClick={() => {
                                    setShowInviteModal(false)
                                    setInviteLink("")
                                }}
                                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[rgb(255 255 255 / 0.06)] transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-lg bg-[rgb(249 115 22 / 0.1)] flex items-center justify-center">
                                    <UserPlus className="h-5 w-5 text-[rgb(251 146 60)]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Invite Team Member</h2>
                                    <p className="text-sm text-[rgb(var(--text-secondary))]">
                                        Send an invite link via email
                                    </p>
                                </div>
                            </div>

                            {inviteLink ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                                        <div className="flex items-center gap-2 text-green-600 mb-2">
                                            <Check className="h-4 w-4" />
                                            <span className="font-medium">Invite Created!</span>
                                        </div>
                                        <p className="text-sm text-[rgb(var(--text-secondary))]">
                                            Share this link with {inviteEmail}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input value={inviteLink} readOnly className="font-mono text-xs" />
                                        <Button onClick={handleCopyLink} className="gap-2 shrink-0">
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => {
                                            setInviteLink("")
                                            setInviteEmail("")
                                        }}
                                    >
                                        Invite Another
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Email Address</label>
                                        <Input
                                            type="email"
                                            placeholder="colleague@company.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Role</label>
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                                            className="w-full px-3 py-2 rounded-lg border border-[rgb(255 255 255 / 0.08)] bg-[rgb(var(--text-primary))]"
                                        >
                                            <option value="admin">Admin - Can manage members</option>
                                            <option value="member">Member - Can edit papers</option>
                                            <option value="viewer">Viewer - Read-only access</option>
                                        </select>
                                    </div>
                                    <Button
                                        className="w-full gap-2"
                                        onClick={handleSendInvite}
                                        disabled={!inviteEmail.trim() || isLoading}
                                    >
                                        <Mail className="h-4 w-4" />
                                        Send Invite
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
