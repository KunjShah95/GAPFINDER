import { motion } from "framer-motion"
import { FileUp, Search, Calendar, DollarSign, ChevronRight } from "lucide-react"

export default function GrantsPage() {
  const grants = [
    { id: "1", agency: "NSF", title: "AI Research Institutes", deadline: "2024-12-15", amount: "$20M", fit: 95, type: "Federal" },
    { id: "2", agency: "NIH", title: "R01 Research Project", deadline: "2024-12-05", amount: "$500K", fit: 87, type: "Federal" },
    { id: "3", agency: "DOE", title: "SCARR Program", deadline: "2024-11-30", amount: "$1.5M", fit: 82, type: "Federal" },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Grant Opportunities</h1>
          <p className="text-slate-400 mt-1">Find and match grants to your research gaps</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Search className="w-4 h-4" /> Match to Gaps</button>
      </div>

      <div className="grid gap-4">
        {grants.map((grant, index) => (
          <motion.div key={grant.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-violet-500/20"><FileUp className="w-6 h-6 text-violet-400" /></div>
                <div>
                  <h3 className="text-lg font-semibold">{grant.title}</h3>
                  <p className="text-sm text-slate-400">{grant.agency} • {grant.type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-400">{grant.amount}</p>
                <p className="text-sm text-slate-400 flex items-center gap-1 justify-end"><Calendar className="w-4 h-4" /> Due {grant.deadline}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Fit Score:</span>
                <span className={`text-sm font-medium ${grant.fit >= 90 ? "text-emerald-400" : "text-yellow-400"}`}>{grant.fit}%</span>
              </div>
              <button className="flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300">View Details <ChevronRight className="w-4 h-4" /></button>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
