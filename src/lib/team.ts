// Team and Organization Service for GapMiner SaaS
// Manages teams, workspaces, roles, and collaboration features
// Storage: localStorage (no Firebase dependency)

import { Timestamp } from "./subscription"

// ── localStorage helpers ───────────────────────────────────────────────────
const PREFIX = 'gapminer:team:'

function ls_read<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(PREFIX + key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const revive = (obj: any): any => {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                if ('seconds' in obj && 'nanoseconds' in obj && !('toDate' in obj)) {
                    return new Timestamp(obj.seconds, obj.nanoseconds)
                }
                for (const k of Object.keys(obj)) obj[k] = revive(obj[k])
            } else if (Array.isArray(obj)) {
                return obj.map(revive)
            }
            return obj
        }
        return revive(parsed) as T
    } catch { return null }
}

function ls_write(key: string, data: any): void {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(data)) } catch { /* quota */ }
}

function makeId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

// ============================================
// TYPES
// ============================================

export type TeamRole = "owner" | "admin" | "member" | "viewer"

export interface Team {
    id?: string
    name: string
    slug: string
    description?: string
    ownerId: string
    avatarUrl?: string
    settings: TeamSettings
    createdAt: Timestamp
    updatedAt: Timestamp
}

export interface TeamSettings {
    allowMemberInvites: boolean
    defaultMemberRole: TeamRole
    sharedCollections: boolean
    requireApproval: boolean
}

export interface TeamMember {
    id?: string
    teamId: string
    userId: string
    email: string
    name: string
    role: TeamRole
    invitedBy: string
    joinedAt: Timestamp
    lastActiveAt?: Timestamp
}

export interface TeamInvite {
    id?: string
    teamId: string
    email: string
    role: TeamRole
    invitedBy: string
    token: string
    expiresAt: Timestamp
    status: "pending" | "accepted" | "expired" | "revoked"
    createdAt: Timestamp
}

export interface AuditLogEntry {
    id?: string
    teamId: string
    userId: string
    action: string
    resourceType: "team" | "member" | "collection" | "paper" | "settings"
    resourceId?: string
    metadata?: Record<string, any>
    ipAddress?: string
    createdAt: Timestamp
}

// ============================================
// TEAM MANAGEMENT
// ============================================

function getTeams(): Team[] {
    return ls_read<Team[]>('teams') ?? []
}

function saveTeams(teams: Team[]): void {
    ls_write('teams', teams)
}

function getMembers(): TeamMember[] {
    return ls_read<TeamMember[]>('members') ?? []
}

function saveMembers(members: TeamMember[]): void {
    ls_write('members', members)
}

function getInvites(): TeamInvite[] {
    return ls_read<TeamInvite[]>('invites') ?? []
}

function saveInvites(invites: TeamInvite[]): void {
    ls_write('invites', invites)
}

function getAuditLog(): AuditLogEntry[] {
    return ls_read<AuditLogEntry[]>('audit') ?? []
}

export async function createTeam(
    name: string,
    ownerId: string,
    ownerEmail: string,
    ownerName: string
): Promise<string> {
    const now = Timestamp.now()
    const id = makeId()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
    const team: Team = {
        id, name, slug, ownerId,
        settings: { allowMemberInvites: false, defaultMemberRole: 'member', sharedCollections: true, requireApproval: false },
        createdAt: now, updatedAt: now,
    }
    saveTeams([...getTeams(), team])
    await addTeamMember(id, ownerId, ownerEmail, ownerName, 'owner', ownerId)
    await logAuditEntry(id, ownerId, 'team.created', 'team', id)
    return id
}

export async function getTeam(teamId: string): Promise<Team | null> {
    return getTeams().find(t => t.id === teamId) ?? null
}

export async function getUserTeams(userId: string): Promise<Team[]> {
    const userTeamIds = getMembers().filter(m => m.userId === userId).map(m => m.teamId)
    return getTeams().filter(t => userTeamIds.includes(t.id!))
}

export async function updateTeam(
    teamId: string,
    updates: Partial<Pick<Team, 'name' | 'description' | 'settings'>>,
    userId: string
): Promise<void> {
    const teams = getTeams().map(t => t.id === teamId ? { ...t, ...updates, updatedAt: Timestamp.now() } : t)
    saveTeams(teams)
    await logAuditEntry(teamId, userId, 'team.updated', 'team', teamId, updates)
}

export async function deleteTeam(teamId: string, userId: string): Promise<void> {
    await logAuditEntry(teamId, userId, 'team.deleted', 'team', teamId)
    saveTeams(getTeams().filter(t => t.id !== teamId))
    saveMembers(getMembers().filter(m => m.teamId !== teamId))
    saveInvites(getInvites().filter(i => i.teamId !== teamId))
}

// ============================================
// TEAM MEMBERS
// ============================================

export async function addTeamMember(
    teamId: string,
    userId: string,
    email: string,
    name: string,
    role: TeamRole,
    invitedBy: string
): Promise<string> {
    const now = Timestamp.now()
    const id = makeId()
    const member: TeamMember = { id, teamId, userId, email, name, role, invitedBy, joinedAt: now, lastActiveAt: now }
    saveMembers([...getMembers(), member])
    await logAuditEntry(teamId, invitedBy, 'member.added', 'member', userId, { role })
    return id
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return getMembers().filter(m => m.teamId === teamId)
}

export async function getTeamMember(teamId: string, userId: string): Promise<TeamMember | null> {
    return getMembers().find(m => m.teamId === teamId && m.userId === userId) ?? null
}

export async function updateMemberRole(
    teamId: string,
    memberId: string,
    newRole: TeamRole,
    updatedBy: string
): Promise<void> {
    saveMembers(getMembers().map(m => m.id === memberId ? { ...m, role: newRole } : m))
    await logAuditEntry(teamId, updatedBy, 'member.role_changed', 'member', memberId, { newRole })
}

export async function removeTeamMember(
    teamId: string,
    memberId: string,
    removedBy: string
): Promise<void> {
    saveMembers(getMembers().filter(m => m.id !== memberId))
    await logAuditEntry(teamId, removedBy, 'member.removed', 'member', memberId)
}

// ============================================
// TEAM INVITES
// ============================================

export async function createInvite(
    teamId: string,
    email: string,
    role: TeamRole,
    invitedBy: string,
    expirationDays = 7
): Promise<TeamInvite> {
    const now = Timestamp.now()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expirationDays)
    const invite: TeamInvite = {
        id: makeId(), teamId,
        email: email.toLowerCase(), role, invitedBy,
        token: generateToken(),
        expiresAt: Timestamp.fromDate(expiresAt),
        status: 'pending', createdAt: now,
    }
    saveInvites([...getInvites(), invite])
    await logAuditEntry(teamId, invitedBy, 'invite.created', 'member', email, { role })
    return invite
}

export async function getInviteByToken(token: string): Promise<TeamInvite | null> {
    const invite = getInvites().find(i => i.token === token && i.status === 'pending')
    if (!invite) return null
    if (invite.expiresAt.toDate() < new Date()) {
        saveInvites(getInvites().map(i => i.token === token ? { ...i, status: 'expired' } : i))
        return null
    }
    return invite
}

export async function acceptInvite(
    token: string,
    userId: string,
    userName: string
): Promise<{ teamId: string } | null> {
    const invite = await getInviteByToken(token)
    if (!invite) return null
    await addTeamMember(invite.teamId, userId, invite.email, userName, invite.role, invite.invitedBy)
    saveInvites(getInvites().map(i => i.id === invite.id ? { ...i, status: 'accepted' } : i))
    return { teamId: invite.teamId }
}

export async function getPendingInvites(teamId: string): Promise<TeamInvite[]> {
    return getInvites().filter(i => i.teamId === teamId && i.status === 'pending')
        .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
}

export async function revokeInvite(
    inviteId: string,
    teamId: string,
    revokedBy: string
): Promise<void> {
    saveInvites(getInvites().map(i => i.id === inviteId ? { ...i, status: 'revoked' } : i))
    await logAuditEntry(teamId, revokedBy, 'invite.revoked', 'member', inviteId)
}

// ============================================
// ROLE PERMISSIONS
// ============================================

export interface RolePermissions {
    canManageTeam: boolean
    canManageMembers: boolean
    canInviteMembers: boolean
    canRemoveMembers: boolean
    canViewAuditLog: boolean
    canManageCollections: boolean
    canEditPapers: boolean
    canViewPapers: boolean
    canExport: boolean
}

export const ROLE_PERMISSIONS: Record<TeamRole, RolePermissions> = {
    owner: {
        canManageTeam: true,
        canManageMembers: true,
        canInviteMembers: true,
        canRemoveMembers: true,
        canViewAuditLog: true,
        canManageCollections: true,
        canEditPapers: true,
        canViewPapers: true,
        canExport: true,
    },
    admin: {
        canManageTeam: false,
        canManageMembers: true,
        canInviteMembers: true,
        canRemoveMembers: true,
        canViewAuditLog: true,
        canManageCollections: true,
        canEditPapers: true,
        canViewPapers: true,
        canExport: true,
    },
    member: {
        canManageTeam: false,
        canManageMembers: false,
        canInviteMembers: false,
        canRemoveMembers: false,
        canViewAuditLog: false,
        canManageCollections: true,
        canEditPapers: true,
        canViewPapers: true,
        canExport: true,
    },
    viewer: {
        canManageTeam: false,
        canManageMembers: false,
        canInviteMembers: false,
        canRemoveMembers: false,
        canViewAuditLog: false,
        canManageCollections: false,
        canEditPapers: false,
        canViewPapers: true,
        canExport: false,
    },
}

export function hasPermission(
    role: TeamRole,
    permission: keyof RolePermissions
): boolean {
    return ROLE_PERMISSIONS[role][permission]
}

// ============================================
// AUDIT LOGGING
// ============================================

export async function logAuditEntry(
    teamId: string,
    userId: string,
    action: string,
    resourceType: AuditLogEntry['resourceType'],
    resourceId?: string,
    metadata?: Record<string, any>
): Promise<void> {
    const entry: AuditLogEntry = {
        id: makeId(), teamId, userId, action, resourceType, resourceId, metadata,
        createdAt: Timestamp.now(),
    }
    const log = getAuditLog()
    log.unshift(entry)
    ls_write('audit', log.slice(0, 500)) // cap at 500 entries
}

export async function getAuditLogs(
    teamId: string,
    limitCount = 50
): Promise<AuditLogEntry[]> {
    return getAuditLog()
        .filter(e => e.teamId === teamId)
        .slice(0, limitCount)
}

// ============================================
// TEAM CONTEXT HELPERS
// ============================================

export function getRoleDisplayName(role: TeamRole): string {
    const names: Record<TeamRole, string> = {
        owner: "Owner",
        admin: "Admin",
        member: "Member",
        viewer: "Viewer",
    }
    return names[role]
}

export function getRoleBadgeColor(role: TeamRole): string {
    const colors: Record<TeamRole, string> = {
        owner: "hsl(45, 93%, 47%)",
        admin: "hsl(270, 91%, 65%)",
        member: "hsl(217, 91%, 60%)",
        viewer: "hsl(var(--muted-foreground))",
    }
    return colors[role]
}
