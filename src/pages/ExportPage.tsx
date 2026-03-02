import { useState } from "react"
import { motion } from "framer-motion"
import { Download, FileText, FileJson, FileCode, Loader2, CheckCircle2 } from "lucide-react"
import { getAccessToken } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type Format = "bibtex" | "json" | "csv"

const formats: { id: Format; name: string; icon: typeof FileText; description: string; ext: string }[] = [
  { id: "bibtex", name: "BibTeX", icon: FileText, description: "For LaTeX documents", ext: "bib" },
  { id: "json", name: "JSON", icon: FileJson, description: "Structured data format", ext: "json" },
  { id: "csv", name: "CSV", icon: FileCode, description: "Spreadsheet compatible", ext: "csv" },
]

async function downloadFile(format: Format) {
  const token = getAccessToken()
  const res = await fetch(`/api/export/papers?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error("Export failed")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const ext = formats.find(f => f.id === format)?.ext ?? format
  a.href = url
  a.download = `papers.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportPage() {
  const [loading, setLoading] = useState<Format | null>(null)
  const [success, setSuccess] = useState<Format | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async (format: Format) => {
    setLoading(format)
    setError(null)
    setSuccess(null)
    try {
      await downloadFile(format)
      setSuccess(format)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError("Export failed. Please try again.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export &amp; Integration</h1>
        <p className="text-muted-foreground mt-1">Export your research papers in various formats</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {formats.map((format, index) => {
          const isLoading = loading === format.id
          const isSuccess = success === format.id
          return (
            <motion.button
              key={format.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleExport(format.id)}
              disabled={!!loading}
              className={cn(
                "card p-6 text-left hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                isSuccess && "ring-2 ring-green-500/50"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <format.icon className="w-6 h-6 text-primary" />
                </div>
                {isLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              </div>
              <h3 className="text-lg font-semibold">{format.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{format.description}</p>
              <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-primary">
                <Download className="w-4 h-4" />
                {isLoading ? "Exporting..." : isSuccess ? "Downloaded!" : `Export as .${format.ext}`}
              </div>
            </motion.button>
          )
        })}
      </div>

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2">Quick Export</h2>
        <p className="text-sm text-muted-foreground mb-5">Download all your papers at once in your preferred format.</p>
        <div className="flex flex-wrap gap-3">
          {formats.map(f => (
            <button
              key={f.id}
              onClick={() => handleExport(f.id)}
              disabled={!!loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === f.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : success === f.id ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export {f.name}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
