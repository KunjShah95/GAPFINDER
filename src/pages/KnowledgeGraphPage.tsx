import { motion } from "framer-motion"
import { useState } from "react"
import { Network, ZoomIn, ZoomOut, Share2, Filter, Plus, Search, Sparkles } from "lucide-react"

export default function KnowledgeGraphPage() {
  const [zoom, setZoom] = useState(1)

  const seededCount = (s: string) => {
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i)
      h |= 0
    }
    return Math.abs(h) % 100
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Knowledge Graph</h1>
          <p className="text-slate-400 mt-1">Explore relationships between papers, concepts, and research gaps</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors"><Share2 className="w-4 h-4" /> Share</button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Sparkles className="w-4 h-4" /> AI Insights</button>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-280px)]">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="w-80 bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input placeholder="Search entities..." className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none" />
          </div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Entity Types</h3>
          <div className="space-y-2">
            {['Papers', 'Concepts', 'Methods', 'Datasets', 'Authors', 'Institutions'].map((type) => (
              <div key={type} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                <span className="text-sm">{type}</span>
                <span className="text-xs text-slate-500">{seededCount(type)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Knowledge Graph Visualization</p>
              <p className="text-sm mt-2">Connect nodes to explore relationships</p>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-2 bg-white/10 rounded-lg hover:bg-white/20"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-sm text-slate-400">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 bg-white/10 rounded-lg hover:bg-white/20"><ZoomIn className="w-4 h-4" /></button>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-sm hover:bg-white/20"><Filter className="w-4 h-4" /> Filter</button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-72 bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Selected Entity</h3>
          <div className="text-center py-8 text-slate-500">
            <p>Click on a node to view details</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
