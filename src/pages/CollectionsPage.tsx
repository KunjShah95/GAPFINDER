import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { motion, AnimatePresence } from "framer-motion"
import {
  FolderOpen,
  Plus,
  Search,
  Star,
  FileText,
  Lightbulb,
  Calendar,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Collection {
  id: string
  name: string
  description?: string
  color: string
  starred: boolean
  paper_count: number
  gap_count: number
  created_at: string
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#3b82f6", "#ef4444",
]

export default function CollectionsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [formError, setFormError] = useState("")

  const { data, isLoading, error } = useQuery<{ collections: Collection[] }>({
    queryKey: ["collections"],
    queryFn: async () => {
      const token = getAccessToken()
      const res = await fetch("/api/collections", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Failed to fetch collections")
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; description?: string; color: string }) => {
      const token = getAccessToken()
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || "Failed to create collection")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      setShowCreate(false)
      setNewName("")
      setNewDescription("")
      setNewColor(PRESET_COLORS[0])
      setFormError("")
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const handleCreate = () => {
    if (!newName.trim()) { setFormError("Collection name is required"); return }
    createMutation.mutate({ name: newName.trim(), description: newDescription.trim() || undefined, color: newColor })
  }

  const collections = data?.collections ?? []
  const filtered = collections.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
          <p className="text-muted-foreground mt-1">Organise your papers and gaps into curated collections</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Collection
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search collections..."
          className="w-full pl-12 pr-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Collections", value: collections.length },
          { label: "Total Papers", value: collections.reduce((s, c) => s + c.paper_count, 0) },
          { label: "Total Gaps", value: collections.reduce((s, c) => s + c.gap_count, 0) },
          { label: "Starred", value: collections.filter(c => c.starred).length },
        ].map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
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
              className="card p-6 w-full max-w-md space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">New Collection</h2>
                <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name *</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. NLP Papers 2024"
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Description</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="What is this collection about?"
                    rows={3}
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Color</label>
                  <div className="flex gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={cn(
                          "w-8 h-8 rounded-lg transition-all",
                          newColor === c && "ring-2 ring-offset-2 ring-offset-background ring-white scale-110"
                        )}
                        style={{ backgroundColor: c }}
                      />
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
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create
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
        <div className="card p-12 text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-muted-foreground">Failed to load collections. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <FolderOpen className="w-16 h-16 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-lg font-medium">No collections yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first collection to organise your research.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Collection
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((collection, index) => (
            <motion.div
              key={collection.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card card-hover p-6 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${collection.color}20`, border: `1px solid ${collection.color}40` }}
                >
                  <FolderOpen className="w-6 h-6" style={{ color: collection.color }} />
                </div>
                {collection.starred && <Star className="w-4 h-4 fill-amber-400 text-amber-400" />}
              </div>

              <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">{collection.name}</h3>
              {collection.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{collection.description}</p>
              )}

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>{collection.paper_count} papers</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lightbulb className="w-4 h-4" />
                  <span>{collection.gap_count} gaps</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(collection.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
