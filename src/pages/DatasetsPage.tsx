import { motion } from "framer-motion"
import { Database, Search, Filter, Star, Download, ChevronRight } from "lucide-react"

export default function DatasetsPage() {
  const datasets = [
    { id: "1", name: "ImageNet", size: "150GB", format: "JPEG", tasks: ["Classification", "Detection"], quality: 95, downloads: 500000 },
    { id: "2", name: "GLUE Benchmark", size: "10GB", format: "JSON", tasks: ["NLP", "QA"], quality: 92, downloads: 100000 },
    { id: "3", name: "COCO", size: "25GB", format: "JSON", tasks: ["Detection", "Segmentation"], quality: 94, downloads: 200000 },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Datasets</h1>
          <p className="text-slate-400 mt-1">Discover and benchmark datasets for your research</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Search className="w-4 h-4" /> Find Datasets</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {datasets.map((ds, index) => (
          <motion.div key={ds.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer">
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg bg-blue-500/20"><Database className="w-5 h-5 text-blue-400" /></div>
              <button className="p-1 rounded-full hover:bg-white/10"><Star className="w-4 h-4 text-yellow-400" /></button>
            </div>
            <h3 className="text-lg font-semibold mt-3">{ds.name}</h3>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
              <span>{ds.size}</span>
              <span>•</span>
              <span>{ds.format}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {ds.tasks.map((task) => (
                <span key={task} className="text-xs px-2 py-1 bg-violet-500/20 text-violet-300 rounded-full">{task}</span>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-1 text-sm text-slate-400"><Download className="w-4 h-4" /> {ds.downloads.toLocaleString()}</div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
