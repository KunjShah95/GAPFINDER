import { motion } from "framer-motion"
import { BarChart3, TrendingUp, Target, Sparkles } from "lucide-react"

export default function ImpactPage() {
  const predictions = [
    { paper: "Attention Is All You Need", citations1y: 8500, citations5y: 45000, tier: "Breakthrough" },
    { paper: "BERT Pre-training", citations1y: 6200, citations5y: 35000, tier: "Significant" },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Impact Analysis</h1>
          <p className="text-slate-400 mt-1">Predict citation impact and research outcomes</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Sparkles className="w-4 h-4" /> Run Predictions</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Predicted Impact", value: "87.3", icon: TrendingUp, color: "from-emerald-500 to-teal-500" },
          { label: "Sleeping Giants", value: "12", icon: Target, color: "from-violet-500 to-purple-500" },
          { label: "Avg Citations", value: "1,234", icon: BarChart3, color: "from-blue-500 to-cyan-500" },
        ].map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} opacity-80`}><stat.icon className="w-6 h-6 text-white" /></div>
              <div><p className="text-sm text-slate-400">{stat.label}</p><p className="text-3xl font-bold mt-1">{stat.value}</p></div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Citation Predictions</h2>
        <div className="space-y-4">
          {predictions.map((pred, index) => (
            <motion.div key={pred.paper} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
              <div>
                <h3 className="font-medium">{pred.paper}</h3>
                <p className="text-sm text-slate-400">{pred.tier} Impact</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">1yr: {pred.citations1y.toLocaleString()}</p>
                <p className="text-sm text-slate-400">5yr: {pred.citations5y.toLocaleString()}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
