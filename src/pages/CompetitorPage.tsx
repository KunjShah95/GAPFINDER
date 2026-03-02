import { motion } from "framer-motion"
import { TrendingUp, Users, Target } from "lucide-react"

export default function CompetitorPage() {
  const groups = [
    { name: "DeepMind", type: "Research Lab", papers: 500, hIndex: 150, active: true },
    { name: "OpenAI", type: "Startup", papers: 200, hIndex: 100, active: true },
    { name: "Stanford AI Lab", type: "University", papers: 1000, hIndex: 200, active: true },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Competitor Analysis</h1>
          <p className="text-slate-400 mt-1">Track research groups and commercial players</p>
        </div>
      </div>

      <div className="grid gap-4">
        {groups.map((group, index) => (
          <motion.div key={group.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/20"><Users className="w-6 h-6 text-blue-400" /></div>
                <div>
                  <h3 className="text-lg font-semibold">{group.name}</h3>
                  <p className="text-sm text-slate-400">{group.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-right">
                <div><p className="text-sm text-slate-400">Papers</p><p className="font-semibold">{group.papers}</p></div>
                <div><p className="text-sm text-slate-400">H-Index</p><p className="font-semibold">{group.hIndex}</p></div>
                <div className={`w-2 h-2 rounded-full ${group.active ? "bg-emerald-500" : "bg-slate-500"}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
