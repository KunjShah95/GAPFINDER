import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import {
    FolderPlus,
    Folder,
    Star,
    StarOff,
    Share2,
    MoreHorizontal,
    Plus,
    Search,
    Download,
    Check,
    Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import {
    getCollections,
    saveCollection,
    toggleCollectionStar,
    getCrawlResults,
    type Collection
} from "@/lib/firestore"

export function CollectionsPage() {
    const { user } = useAuth()
    const [collections, setCollections] = useState<Collection[]>([])
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newCollectionName, setNewCollectionName] = useState("")
    const [newCollectionDescription, setNewCollectionDescription] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [allGaps, setAllGaps] = useState<any[]>([])

    useEffect(() => {
        if (!user) return

        async function loadData() {
            try {
                const [collectionsData, resultsData] = await Promise.all([
                    getCollections(user!.id),
                    getCrawlResults(user!.id)
                ])
                setCollections(collectionsData)

                // Flatten gaps for display
                const gaps = resultsData.flatMap(r => r.gaps.map(g => ({
                    ...g,
                    paper: r.title,
                })))
                setAllGaps(gaps)
            } catch (error) {
                console.error("Failed to load collections:", error)
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [user])

    const handleToggleStar = async (collection: Collection) => {
        if (!collection.id) return
        const newStarred = !collection.starred

        // Optimistic update
        setCollections(prev =>
            prev.map(c => c.id === collection.id ? { ...c, starred: newStarred } : c)
        )

        try {
            await toggleCollectionStar(collection.id, newStarred)
        } catch (error) {
            console.error("Failed to toggle star:", error)
            // Rollback
            setCollections(prev =>
                prev.map(c => c.id === collection.id ? { ...c, starred: !newStarred } : c)
            )
        }
    }

    const handleCreateCollection = async () => {
        if (!user || !newCollectionName.trim()) return

        const collectionData = {
            userId: user.id,
            name: newCollectionName,
            description: newCollectionDescription,
            gapCount: 0,
            paperCount: 0,
            starred: false,
            color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
            gapIds: []
        }

        try {
            const id = await saveCollection(collectionData)
            const newCollection: Collection = {
                ...collectionData,
                id,
                createdAt: new Date().toISOString()
            }
            setCollections(prev => [newCollection, ...prev])
            setNewCollectionName("")
            setNewCollectionDescription("")
            setShowCreateModal(false)
        } catch (error) {
            console.error("Failed to create collection:", error)
        }
    }

    const filteredCollections = collections.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    )

    const starredCollections = filteredCollections.filter(c => c.starred)
    const otherCollections = filteredCollections.filter(c => !c.starred)

    const selectedCollectionData = collections.find(c => c.id === selectedCollection)
    const selectedGaps = allGaps.filter(g => selectedCollectionData?.gapIds.includes(g.id))

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                {/* Header */}
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <div className="section-number mb-4">COLLECTIONS</div>
                        <h1 className="heading-section mb-4">
                            Research Gap
                            <br />
                            <span className="gradient-text">Collections</span>
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl">
                            Organize your research gaps into themed collections.
                            Share, export, or use them to track research directions.
                        </p>
                    </div>
                    <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                        <FolderPlus className="h-4 w-4" />
                        New Collection
                    </Button>
                </div>

                {/* Search */}
                <div className="mb-8">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search collections..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Collections List */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Starred */}
                        {starredCollections.length > 0 && (
                            <div>
                                <h2 className="font-semibold mb-4 flex items-center gap-2">
                                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                    Starred Collections
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {starredCollections.map((collection, idx) => (
                                        <motion.div
                                            key={collection.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <Card
                                                className={cn(
                                                    "cursor-pointer card-hover",
                                                    selectedCollection === collection.id && "ring-2 ring-ring"
                                                )}
                                                onClick={() => setSelectedCollection(collection.id || null)}
                                            >
                                                <CardContent className="pt-6">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div
                                                            className="h-10 w-10 rounded-lg flex items-center justify-center"
                                                            style={{ backgroundColor: collection.color + "20" }}
                                                        >
                                                            <Folder
                                                                className="h-5 w-5"
                                                                style={{ color: collection.color }}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleStar(collection) }}
                                                            className="p-1 hover:bg-muted rounded"
                                                        >
                                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                        </button>
                                                    </div>
                                                    <h3 className="font-semibold mb-1">{collection.name}</h3>
                                                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                                                        {collection.description}
                                                    </p>
                                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                        <span>{collection.gapCount} gaps</span>
                                                        <span>•</span>
                                                        <span>{collection.paperCount} papers</span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Other Collections */}
                        <div>
                            <h2 className="font-semibold mb-4 flex items-center gap-2">
                                <Folder className="h-4 w-4" />
                                All Collections
                            </h2>
                            {otherCollections.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {otherCollections.map((collection, idx) => (
                                        <motion.div
                                            key={collection.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <Card
                                                className={cn(
                                                    "cursor-pointer card-hover",
                                                    selectedCollection === collection.id && "ring-2 ring-ring"
                                                )}
                                                onClick={() => setSelectedCollection(collection.id || null)}
                                            >
                                                <CardContent className="pt-6">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div
                                                            className="h-10 w-10 rounded-lg flex items-center justify-center"
                                                            style={{ backgroundColor: collection.color + "20" }}
                                                        >
                                                            <Folder
                                                                className="h-5 w-5"
                                                                style={{ color: collection.color }}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleStar(collection) }}
                                                            className="p-1 hover:bg-muted rounded"
                                                        >
                                                            <StarOff className="h-4 w-4 text-muted-foreground" />
                                                        </button>
                                                    </div>
                                                    <h3 className="font-semibold mb-1">{collection.name}</h3>
                                                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                                                        {collection.description}
                                                    </p>
                                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                        <span>{collection.gapCount} gaps</span>
                                                        <span>•</span>
                                                        <span>{collection.paperCount} papers</span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg border-dashed">
                                    No other collections found.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Sidebar - Collection Details */}
                    <div>
                        {selectedCollectionData ? (
                            <Card className="sticky top-20">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">Collection Details</CardTitle>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <Share2 className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-medium mb-2">Gaps in this collection</h4>
                                        <div className="space-y-2">
                                            {selectedGaps.length > 0 ? (
                                                selectedGaps.map((gap: any) => (
                                                    <div
                                                        key={gap.id}
                                                        className="p-3 rounded-lg bg-muted text-sm"
                                                    >
                                                        <p className="line-clamp-2 text-xs">{gap.problem}</p>
                                                        <p className="text-[10px] text-muted-foreground mt-1">
                                                            {gap.paper}
                                                        </p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs text-muted-foreground">
                                                    No gaps in this collection yet.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-border space-y-2">
                                        <Link to="/explore">
                                            <Button variant="outline" size="sm" className="w-full gap-2">
                                                <Plus className="h-3 w-3" />
                                                Add Gaps from Explore
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="border-dashed">
                                <CardContent className="py-12 text-center">
                                    <Folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                                    <p className="text-muted-foreground">
                                        Select a collection to view details
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/50"
                            onClick={() => setShowCreateModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md p-4"
                        >
                            <Card>
                                <CardHeader>
                                    <CardTitle>Create New Collection</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">
                                                Collection Name
                                            </label>
                                            <Input
                                                placeholder="e.g., NLP Research Gaps"
                                                value={newCollectionName}
                                                onChange={(e) => setNewCollectionName(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">
                                                Description (Optional)
                                            </label>
                                            <Input
                                                placeholder="What is this collection about?"
                                                value={newCollectionDescription}
                                                onChange={(e) => setNewCollectionDescription(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end pt-4">
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowCreateModal(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>
                                            <Check className="h-4 w-4 mr-2" />
                                            Create
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
