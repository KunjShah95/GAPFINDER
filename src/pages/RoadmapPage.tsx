import { motion } from "framer-motion"
import { Map, Calendar, Target, Zap, ChevronRight } from "lucide-react"

export default function RoadmapPage() {
  const phases = [
    { name: "Foundation", months: "Months 1-6", status: "completed", milestones: ["Literature Review", "Methodology Design"] },
    { name: "Development", months: "Months 7-18", status: "in_progress", milestones: ["Core Implementation", "Initial Experiments"] },
    { name: "Evaluation", months: "Months 19-30", status: "pending", milestones: ["Ablation Studies", "Benchmark Comparison"] },
    { name: "Publication", months: "Months 31-36", status: "pending", milestones: ["Paper Writing", "Submission"] },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Research Roadmap</h1>
          <p className="text-slate-400 mt-1">Plan your multi-year research journey</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Zap className="w-4 h-4" /> Generate Roadmap</button>
      </div>

      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-violet-500 via-fuchsia-500 to-pink-500" />
        <div className="space-y-4">
          {phases.map((phase, index) => (
            <motion.div key={phase.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="flex gap-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 border-4 ${phase.status === "completed" ? "bg-emerald-500 border-emerald-500/30" : phase.status === "in_progress" ? "bg-violet-500 border-violet-500/30" : "bg-slate-800 border-slate-700"}`}>
                {phase.status === "completed" ? <Target className="w-6 h-6 text-emerald-400" /> : phase.status === "in_progress" ? <Zap className="w-6 h-6 text-violet-400" /> : <Map className="w-6 h-6 text-slate-500" />}
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{phase.name}</h3>
                    <p className="text-sm text-slate-400">{phase.months}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {phase.milestones.map((milestone) => (
                    <span key={milestone} className="text-xs px-2 py-1 bg-white/10 rounded text-slate-300">{milestone}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
