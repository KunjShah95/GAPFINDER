import { motion } from "framer-motion"
import { BookOpen, FileText, Sparkles, Download, Share2, ChevronRight } from "lucide-react"

export default function LiteratureReviewPage() {
  const sections = [
    { title: "Introduction", status: "complete", papers: 5 },
    { title: "Related Work", status: "in_progress", papers: 12 },
    { title: "Methodology", status: "pending", papers: 0 },
    { title: "Results", status: "pending", papers: 0 },
    { title: "Discussion", status: "pending", papers: 0 },
  ]

  const clusters = [
    { name: "Transformers", papers: 45, description: "Attention-based architectures" },
    { name: "Few-Shot Learning", papers: 32, description: "Meta-learning approaches" },
    { name: "Diffusion Models", papers: 28, description: "Generative modeling" },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Literature Review</h1>
          <p className="text-slate-400 mt-1">Generate comprehensive "Related Work" sections</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors"><Download className="w-4 h-4" /> Export</button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Sparkles className="w-4 h-4" /> Generate Review</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Review Sections</h2>
          {sections.map((section, index) => (
            <motion.div key={section.title} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${section.status === "complete" ? "bg-emerald-500/20 text-emerald-400" : section.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" : "bg-slate-700 text-slate-400"}`}>
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{section.title}</h3>
                    <p className="text-sm text-slate-400">{section.papers} papers referenced</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          <h2 className="text-lg font-semibold">Research Clusters</h2>
          {clusters.map((cluster) => (
            <div key={cluster.name} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors cursor-pointer">
              <h3 className="font-medium">{cluster.name}</h3>
              <p className="text-sm text-slate-400 mt-1">{cluster.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-500">{cluster.papers} papers</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}
