import { motion } from "framer-motion"
import { useState } from "react"
import { GitBranch, Play, Plus, Settings, Calendar, Zap, FileText, Lightbulb, ChevronRight } from "lucide-react"

const workflows = [
  { id: "1", name: "PhD Research Workflow", status: "active", progress: 65, nextStep: "Literature Review", template: "PhD Research" },
  { id: "2", name: "Startup Validation", status: "paused", progress: 40, nextStep: "Gap Analysis", template: "Startup Validation" },
  { id: "3", name: "Literature Review Automation", status: "completed", progress: 100, nextStep: "Complete", template: "Custom" },
]

const templates = [
  { id: "phd", name: "PhD Research", description: "Complete workflow for doctoral research", icon: FileText, color: "from-blue-500 to-cyan-500" },
  { id: "startup", name: "Startup Validation", description: "Validate research for startup opportunities", icon: Zap, color: "from-orange-500 to-red-500" },
  { id: "review", name: "Literature Review", description: "Systematic review automation", icon: Lightbulb, color: "from-violet-500 to-purple-500" },
  { id: "custom", name: "Custom Workflow", description: "Build your own workflow", icon: GitBranch, color: "from-emerald-500 to-teal-500" },
]

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<"workflows" | "templates">("workflows")

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Workflows</h1>
          <p className="text-slate-400 mt-1">Automate your research pipeline with intelligent workflows</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Plus className="w-4 h-4" /> New Workflow</button>
      </div>

      <div className="flex gap-2 p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
        <button onClick={() => setActiveTab("workflows")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "workflows" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"}`}>My Workflows</button>
        <button onClick={() => setActiveTab("templates")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "templates" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"}`}>Templates</button>
      </div>

      {activeTab === "workflows" ? (
        <div className="grid gap-4">
          {workflows.map((workflow, index) => (
            <motion.div key={workflow.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${workflow.status === "active" ? "bg-emerald-500/20 text-emerald-400" : workflow.status === "paused" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}>
                    <GitBranch className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{workflow.name}</h3>
                    <p className="text-sm text-slate-400">Template: {workflow.template}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"><Settings className="w-4 h-4" /></button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-violet-500 rounded-full font-medium hover:bg-violet-600 transition-colors"><Play className="w-4 h-4" /> {workflow.status === "active" ? "Continue" : "Start"}</button>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-slate-300">{workflow.progress}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all" style={{ width: `${workflow.progress}%` }} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="w-4 h-4" />
                <span>Next: {workflow.nextStep}</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template, index) => (
            <motion.div key={template.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="group bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-violet-500/30 transition-all cursor-pointer">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${template.color} mb-4`}>
                <template.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold group-hover:text-violet-400 transition-colors">{template.name}</h3>
              <p className="text-sm text-slate-400 mt-1">{template.description}</p>
              <button className="mt-4 flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300">Use Template <ChevronRight className="w-4 h-4" /></button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
