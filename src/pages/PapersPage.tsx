import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/api-client"
import { motion } from "framer-motion"
import {
  FileText,
  Search,
  Filter,
  Download,
  Star,
  Eye,
  MessageSquare,
  Share2,
  MoreHorizontal,
  Plus,
  Grid,
  List,
  SortAsc,
  Calendar,
  Tag,
  ChevronDown,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ApiPaper {
  id: string
  url: string
  title: string
  abstract?: string
  authors?: string[]
  venue?: string
  year?: number
  citation_count?: number
  gap_count?: string
  metadata?: Record<string, unknown>
}

const filters = [
  { label: "Year", options: ["2024", "2023", "2022", "2021", "2020", "All"] },
  { label: "Venue", options: ["NeurIPS", "ICML", "ICLR", "CVPR", "ACL", "arXiv", "All"] },
  { label: "Domain", options: ["NLP", "Computer Vision", "ML", "AI", "Robotics", "All"] },
]

export default function PapersPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({})

  const { data: papersData, isLoading } = useQuery({
    queryKey: ['papers', searchQuery, selectedFilters],
    queryFn: async () => {
      const token = getAccessToken()
      const params = new URLSearchParams({ limit: '20' })
      if (searchQuery) params.set('q', searchQuery)
      if (selectedFilters.Year && selectedFilters.Year !== 'All') params.set('year', selectedFilters.Year)
      if (selectedFilters.Venue && selectedFilters.Venue !== 'All') params.set('venue', selectedFilters.Venue)
      const res = await fetch(`/api/papers?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to fetch papers')
      return res.json() as Promise<{ papers: ApiPaper[]; total: number }>
    },
    staleTime: 2 * 60 * 1000,
  })

  const papers = papersData?.papers ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Papers Library</h1>
          <p className="text-muted-foreground mt-1">Manage and analyze your research papers</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Paper
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers by title, author, or keyword..."
            className="w-full pl-12 pr-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {filters.map((filter) => (
            <div key={filter.label} className="relative group">
              <Button variant="outline" className="gap-2">
                <span className="text-sm">{filter.label}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
              <div className="absolute top-full left-0 mt-2 w-40 bg-popover border border-border rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg">
                {filter.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => setSelectedFilters({ ...selectedFilters, [filter.label]: option })}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm hover:bg-muted first:rounded-t-xl last:rounded-b-xl transition-colors",
                      selectedFilters[filter.label] === option ? "text-primary font-medium" : "text-foreground"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            More Filters
          </Button>
          <div className="flex items-center gap-1 bg-muted border border-border rounded-xl p-1">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Papers", value: (papersData?.total ?? 0).toString(), icon: FileText },
          { label: "Analyzed", value: papers.filter(p => parseInt(p.gap_count ?? '0') > 0).length.toString(), icon: Eye },
          { label: "Starred", value: papers.length.toString(), icon: Star },
          { label: "This Month", value: "12", icon: Calendar },
        ].map((stat, index) => (
          <div key={stat.label} className="card card-hover p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Papers List */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Showing {papers.length} papers</span>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <SortAsc className="w-4 h-4" />
              Sort by: Recent
            </button>
          </div>
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6" : "divide-y divide-border"}>
            {papers.map((paper, index) => (
              <motion.div
                key={paper.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  viewMode === "grid" ? "card card-hover p-5 cursor-pointer" : "px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className={cn("font-semibold group-hover:text-primary transition-colors", viewMode === "list" ? "text-lg" : "text-base")}>
                      {paper.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{(paper.authors ?? []).join(", ")}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-muted rounded-md text-foreground border border-border">{paper.year}</span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded-md text-foreground border border-border">{paper.venue}</span>
                      <span className="text-xs text-primary font-medium">{(paper.citation_count ?? 0).toLocaleString()} citations</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {((paper.metadata?.tags as string[]) ?? []).map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg transition-colors text-muted-foreground hover:text-amber-500">
                      <Star className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {viewMode === "list" && (
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-4 h-4" />
                      {parseInt(paper.gap_count ?? '0') > 0 ? "View Analysis" : "Analyze"}
                    </button>
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <MessageSquare className="w-4 h-4" />
                      Discuss
                    </button>
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
