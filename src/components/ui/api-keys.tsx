// API Keys Management UI Component
// Developer portal for creating and managing API keys

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Key,
    Plus,
    Copy,
    Check,
    Trash2,
    EyeOff,
    Shield,
    Clock,
    Activity,
    AlertTriangle,
    X,
    Settings,
} from "lucide-react"
import { Button } from "./button"
import { Card, CardContent, CardHeader, CardTitle } from "./card"
import { Badge } from "./badge"
import { Input } from "./input"
import { useAuth } from "@/context/AuthContext"
import {
    getAPIKeys,
    createAPIKey,
    deleteAPIKey,
    revokeAPIKey,
    getPermissionLabel,
    PERMISSION_GROUPS,
    type APIKey,
    type APIPermission,
} from "@/lib/api-keys"

export function APIKeysManager() {
    const { user } = useAuth()
    const [keys, setKeys] = useState<APIKey[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
    const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)

    useEffect(() => {
        if (user) {
            loadKeys()
        }
    }, [user])

    async function loadKeys() {
        if (!user) return
        setIsLoading(true)
        try {
            const apiKeys = await getAPIKeys(user.id)
            setKeys(apiKeys)
        } catch (error) {
            console.error("Failed to load API keys:", error)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleCreateKey(
        name: string,
        permissions: APIPermission[],
        rateLimit: number
    ) {
        if (!user) return
        try {
            const { key, apiKey } = await createAPIKey(user.id, name, permissions, {
                rateLimit,
            })
            setNewlyCreatedKey(key)
            setKeys(prev => [apiKey, ...prev])
        } catch (error) {
            console.error("Failed to create API key:", error)
        }
    }

    async function handleDeleteKey(keyId: string) {
        if (!confirm("Are you sure you want to delete this API key? This cannot be undone.")) return
        try {
            await deleteAPIKey(keyId)
            setKeys(prev => prev.filter(k => k.id !== keyId))
        } catch (error) {
            console.error("Failed to delete API key:", error)
        }
    }

    async function handleRevokeKey(keyId: string) {
        try {
            await revokeAPIKey(keyId)
            setKeys(prev => prev.map(k =>
                k.id === keyId ? { ...k, isActive: false } : k
            ))
        } catch (error) {
            console.error("Failed to revoke API key:", error)
        }
    }

    function handleCopyKey(key: string, keyId: string) {
        navigator.clipboard.writeText(key)
        setCopiedKeyId(keyId)
        setTimeout(() => setCopiedKeyId(null), 2000)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Key className="h-5 w-5 text-[hsl(var(--brand-primary))]" />
                        API Keys
                    </h2>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Create and manage API keys for programmatic access
                    </p>
                </div>
                <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Key
                </Button>
            </div>

            {/* Newly Created Key Alert */}
            <AnimatePresence>
                {newlyCreatedKey && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 rounded-xl bg-green-500/10 border border-green-500/20"
                    >
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-medium text-green-600 mb-1">
                                    API Key Created Successfully!
                                </h3>
                                <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
                                    Copy this key now. You won't be able to see it again.
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        value={newlyCreatedKey}
                                        readOnly
                                        className="font-mono text-sm"
                                    />
                                    <Button
                                        onClick={() => {
                                            navigator.clipboard.writeText(newlyCreatedKey)
                                            setNewlyCreatedKey(null)
                                        }}
                                        className="gap-2 shrink-0"
                                    >
                                        <Copy className="h-4 w-4" />
                                        Copy & Close
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Keys List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Your API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map(i => (
                                <div key={i} className="animate-pulse h-20 rounded-lg bg-[hsl(var(--muted))]" />
                            ))}
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
                            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="mb-2">No API keys yet</p>
                            <p className="text-sm">Create your first API key to get started</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {keys.map((apiKey, idx) => (
                                <motion.div
                                    key={apiKey.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`p-4 rounded-xl border transition-colors ${apiKey.isActive
                                        ? "border-[hsl(var(--border))] hover:border-[hsl(var(--brand-primary))]/50"
                                        : "border-red-500/20 bg-red-500/5"
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="font-medium">{apiKey.name}</h3>
                                                <Badge
                                                    variant={apiKey.isActive ? "default" : "destructive"}
                                                    className="text-xs"
                                                >
                                                    {apiKey.isActive ? "Active" : "Revoked"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2 mb-3">
                                                <code className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-sm font-mono">
                                                    {apiKey.prefix}...
                                                </code>
                                                <button
                                                    onClick={() => handleCopyKey(apiKey.prefix + "••••••••", apiKey.id!)}
                                                    className="p-1 rounded hover:bg-[hsl(var(--muted))] transition-colors"
                                                >
                                                    {copiedKeyId === apiKey.id ? (
                                                        <Check className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <Copy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                                                    )}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {apiKey.permissions.slice(0, 4).map(perm => (
                                                    <Badge key={perm} variant="secondary" className="text-xs">
                                                        {getPermissionLabel(perm)}
                                                    </Badge>
                                                ))}
                                                {apiKey.permissions.length > 4 && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        +{apiKey.permissions.length - 4} more
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                                                <span className="flex items-center gap-1">
                                                    <Activity className="h-3 w-3" />
                                                    {apiKey.rateLimit} req/min
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    Created {apiKey.createdAt.toDate().toLocaleDateString()}
                                                </span>
                                                {apiKey.lastUsedAt && (
                                                    <span>
                                                        Last used {apiKey.lastUsedAt.toDate().toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {apiKey.isActive && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRevokeKey(apiKey.id!)}
                                                    className="text-yellow-600 hover:text-yellow-700"
                                                >
                                                    <EyeOff className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteKey(apiKey.id!)}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Modal */}
            <CreateAPIKeyModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreate={handleCreateKey}
            />
        </div>
    )
}

// Create API Key Modal
function CreateAPIKeyModal({
    isOpen,
    onClose,
    onCreate,
}: {
    isOpen: boolean
    onClose: () => void
    onCreate: (name: string, permissions: APIPermission[], rateLimit: number) => void
}) {
    const [name, setName] = useState("")
    const [rateLimit, setRateLimit] = useState(60)
    const [selectedPreset, setSelectedPreset] = useState<"read" | "write" | "full">("read")
    const [customPermissions, setCustomPermissions] = useState<APIPermission[]>([])
    const [useCustom, setUseCustom] = useState(false)

    const allPermissions: APIPermission[] = [
        "papers:read", "papers:write",
        "gaps:read", "gaps:write",
        "collections:read", "collections:write",
        "batch:execute", "analytics:read",
    ]

    function handleSubmit() {
        const permissions = useCustom ? customPermissions : PERMISSION_GROUPS[selectedPreset]
        onCreate(name, permissions, rateLimit)
        setName("")
        setRateLimit(60)
        setSelectedPreset("read")
        setCustomPermissions([])
        setUseCustom(false)
        onClose()
    }

    function togglePermission(perm: APIPermission) {
        setCustomPermissions(prev =>
            prev.includes(perm)
                ? prev.filter(p => p !== perm)
                : [...prev, perm]
        )
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative z-10 w-full max-w-lg mx-4 bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] shadow-xl"
                    >
                        <div className="p-6 border-b border-[hsl(var(--border))]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-[hsl(var(--brand-primary))]/10 flex items-center justify-center">
                                        <Key className="h-5 w-5 text-[hsl(var(--brand-primary))]" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold">Create API Key</h2>
                                        <p className="text-sm text-[hsl(var(--muted-foreground))]">
                                            Configure permissions and rate limits
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-[hsl(var(--muted))] transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Key Name</label>
                                <Input
                                    placeholder="e.g., Production API"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>

                            {/* Permission Presets */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Permissions</label>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {(["read", "write", "full"] as const).map(preset => (
                                        <button
                                            key={preset}
                                            onClick={() => {
                                                setSelectedPreset(preset)
                                                setUseCustom(false)
                                            }}
                                            className={`p-3 rounded-lg border text-center capitalize transition-colors ${!useCustom && selectedPreset === preset
                                                ? "border-[hsl(var(--brand-primary))] bg-[hsl(var(--brand-primary))]/10"
                                                : "border-[hsl(var(--border))] hover:border-[hsl(var(--brand-primary))]/50"
                                                }`}
                                        >
                                            <Shield className="h-4 w-4 mx-auto mb-1" />
                                            <p className="text-sm font-medium">{preset}</p>
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setUseCustom(!useCustom)}
                                    className="flex items-center gap-2 text-sm text-[hsl(var(--brand-primary))]"
                                >
                                    <Settings className="h-4 w-4" />
                                    {useCustom ? "Use preset" : "Custom permissions"}
                                </button>

                                {useCustom && (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {allPermissions.map(perm => (
                                            <button
                                                key={perm}
                                                onClick={() => togglePermission(perm)}
                                                className={`p-2 rounded-lg border text-left text-sm transition-colors ${customPermissions.includes(perm)
                                                    ? "border-[hsl(var(--brand-primary))] bg-[hsl(var(--brand-primary))]/10"
                                                    : "border-[hsl(var(--border))]"
                                                    }`}
                                            >
                                                {getPermissionLabel(perm)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Rate Limit */}
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Rate Limit (requests/minute)
                                </label>
                                <Input
                                    type="number"
                                    value={rateLimit}
                                    onChange={e => setRateLimit(parseInt(e.target.value) || 60)}
                                    min={1}
                                    max={1000}
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-[hsl(var(--border))] flex justify-end gap-3">
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!name.trim()}
                                className="gap-2"
                            >
                                <Key className="h-4 w-4" />
                                Create Key
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
