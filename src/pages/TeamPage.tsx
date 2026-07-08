import { motion } from "framer-motion"
import { Users, Settings, Crown, Mail, Shield } from "lucide-react"

export default function TeamPage() {
  const members = [
    { name: "John Doe", role: "Owner", email: "john@example.com", status: "active" },
    { name: "Jane Smith", role: "Editor", email: "jane@example.com", status: "active" },
    { name: "Bob Wilson", role: "Viewer", email: "bob@example.com", status: "pending" },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Team</h1>
          <p className="text-slate-400 mt-1">Manage your research team</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full font-medium"><Mail className="w-4 h-4" /> Invite Member</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <Users className="w-8 h-8 text-blue-400 mb-3" />
          <p className="text-2xl font-bold">3</p>
          <p className="text-sm text-slate-400">Team Members</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <Shield className="w-8 h-8 text-emerald-400 mb-3" />
          <p className="text-2xl font-bold">2</p>
          <p className="text-sm text-slate-400">Active Members</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <Crown className="w-8 h-8 text-amber-400 mb-3" />
          <p className="text-2xl font-bold">1</p>
          <p className="text-sm text-slate-400">Pending Invites</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Team Members</h2>
        <div className="space-y-3">
          {members.map((member, index) => (
            <motion.div key={member.email} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500" />
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-slate-400">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">{member.role}</span>
                <button className="p-2 rounded-full hover:bg-white/10"><Settings className="w-4 h-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
