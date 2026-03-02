import { motion } from "framer-motion"
import { useState } from "react"
import { Settings, Bell, Moon, Shield, CreditCard, User, Palette, Globe, Zap, TrendingUp, FileText, MessageSquare, GitBranch, ArrowRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { useSubscription } from "@/context/SubscriptionContext"
import { TIER_LIMITS } from "@/lib/subscription"

const sections = [
  { id: "profile", name: "Profile", icon: User },
  { id: "notifications", name: "Notifications", icon: Bell },
  { id: "appearance", name: "Appearance", icon: Palette },
  { id: "billing", name: "Billing", icon: CreditCard },
  { id: "security", name: "Security", icon: Shield },
  { id: "api", name: "API Keys", icon: Globe },
]

// ─── Billing Panel ────────────────────────────────────────────────────────────

function UsageBar({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number; icon: React.FC<{ className?: string }> }) {
  const isUnlimited = limit === -1
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const warning = pct >= 80
  const critical = pct >= 95

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <div className="flex items-center gap-2 text-[rgb(var(--muted-foreground))]">
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </div>
        <span className={`font-medium text-xs ${critical ? "text-red-400" : warning ? "text-amber-400" : "text-[rgb(var(--foreground))]"}`}>
          {isUnlimited ? `${used.toLocaleString()} / ∞` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 rounded-full bg-[rgb(var(--muted))]/50">
          <div
            className={`h-2 rounded-full transition-all ${critical ? "bg-red-500" : warning ? "bg-amber-500" : "bg-[rgb(var(--primary))]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-40" />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active" || status === "trialing") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
        <CheckCircle2 className="w-3 h-3" /> {status === "trialing" ? "Trial" : "Active"}
      </span>
    )
  }
  if (status === "past_due") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium">
        <AlertCircle className="w-3 h-3" /> Past due
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 text-xs font-medium">
      <XCircle className="w-3 h-3" /> {status}
    </span>
  )
}

function BillingPanel() {
  const navigate = useNavigate()
  const { subscription, usage, tierName, limits, triggerUpgrade, tier } = useSubscription()

  const tierColor: Record<string, string> = {
    free: "from-slate-500 to-slate-600",
    pro: "from-violet-500 to-fuchsia-500",
    team: "from-blue-500 to-cyan-500",
    enterprise: "from-amber-500 to-orange-500",
  }

  const planMonthlyPrices: Record<string, string> = {
    free: "$0/mo",
    pro: "$29/mo",
    team: "$99/mo",
    enterprise: "Custom",
  }

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd.seconds * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—"

  const papersUsed = usage?.papersProcessed ?? 0
  const gapsUsed = usage?.gapsExtracted ?? 0
  const exportsUsed = usage?.exportCount ?? 0
  const apiCallsUsed = usage?.apiCalls ?? 0

  const proFeatures = [
    "500 papers/month", "5 publisher feeds", "20 research alerts",
    "500 AI chat messages", "20 saved workflows", "Competitor analysis",
    "Grant matching", "PDF & JSON exports", "Priority processing",
  ]

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div className={`rounded-2xl p-5 bg-gradient-to-br ${tierColor[tier] ?? "from-slate-500 to-slate-600"} bg-opacity-10 border border-white/10`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold">{tierName} Plan</span>
              {subscription && <StatusBadge status={subscription.status} />}
            </div>
            <p className="text-sm text-[rgb(var(--muted-foreground))]">
              {planMonthlyPrices[tier]} · Renews {renewalDate}
            </p>
          </div>
          {tier !== "enterprise" && (
            <button
              onClick={() => triggerUpgrade("Upgrade your plan to unlock more features.")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-all whitespace-nowrap"
            >
              <Zap className="w-4 h-4" /> Upgrade plan
            </button>
          )}
        </div>
        {subscription?.cancelAtPeriodEnd && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Your subscription will cancel at the end of this billing period.
          </div>
        )}
      </div>

      {/* Usage Meters */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide">This month's usage</h3>
        <UsageBar label="Papers analyzed"    used={papersUsed}   limit={limits.papersPerMonth}       icon={FileText} />
        <UsageBar label="Gaps extracted"     used={gapsUsed}     limit={limits.papersPerMonth * limits.gapsPerPaper > 0 ? limits.papersPerMonth * limits.gapsPerPaper : -1} icon={TrendingUp} />
        <UsageBar label="AI chat messages"   used={0}            limit={limits.chatMessagesPerMonth} icon={MessageSquare} />
        <UsageBar label="Exports"            used={exportsUsed}  limit={50}                          icon={FileText} />
        {limits.apiAccess && (
          <UsageBar label="API calls"        used={apiCallsUsed} limit={limits.papersPerMonth * 10}  icon={Globe} />
        )}
        <UsageBar label="Saved workflows"    used={0}            limit={limits.workflowsLimit}       icon={GitBranch} />
      </div>

      {/* Plan Features */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wide mb-4">Included in your plan</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            `${limits.papersPerMonth === -1 ? "Unlimited" : limits.papersPerMonth} papers/month`,
            `${limits.alertsLimit === -1 ? "Unlimited" : limits.alertsLimit} research alerts`,
            `${limits.latestPapersPublishers === -1 ? "All" : limits.latestPapersPublishers} publisher feeds`,
            `${limits.chatMessagesPerMonth === -1 ? "Unlimited" : limits.chatMessagesPerMonth} AI messages/month`,
            `${limits.collectionsLimit === -1 ? "Unlimited" : limits.collectionsLimit} collections`,
            `${limits.teamMembers === -1 ? "Unlimited" : limits.teamMembers} team member${limits.teamMembers !== 1 ? "s" : ""}`,
            ...limits.exportFormats.map(f => `${f.toUpperCase()} export`),
            limits.priorityProcessing ? "Priority AI processing" : null,
            limits.competitorTracking ? "Competitor analysis" : null,
            limits.grantMatching ? "Grant matching" : null,
            limits.impactPrediction ? "Impact prediction" : null,
            limits.apiAccess ? "API access" : null,
          ].filter(Boolean).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[rgb(var(--primary))] shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade CTA — only shown to free users */}
      {tier === "free" && (
        <div className="rounded-2xl p-5 border border-violet-500/30 bg-violet-500/5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Upgrade to Pro — $29/mo</h3>
              <p className="text-sm text-[rgb(var(--muted-foreground))] mt-0.5">
                10× your paper quota, unlock all publisher feeds, and get AI-powered grant matching.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-2 mb-4">
            {proFeatures.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-[rgb(var(--muted-foreground))]">
                <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => triggerUpgrade("Upgrade to Pro for 10x more papers, all publisher feeds, and advanced analysis.")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium hover:opacity-90 transition-all"
            >
              Upgrade to Pro <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate("/pricing")}
              className="px-5 py-2.5 rounded-xl border border-[rgb(var(--border))] text-sm hover:bg-[rgb(var(--muted))] transition-all"
            >
              Compare plans
            </button>
          </div>
        </div>
      )}

      {/* Manage subscription */}
      {tier !== "free" && (
        <div className="card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Manage subscription</p>
            <p className="text-sm text-[rgb(var(--muted-foreground))] mt-0.5">Update payment method, download invoices, or cancel.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[rgb(var(--border))] text-sm hover:bg-[rgb(var(--muted))] transition-all whitespace-nowrap">
            <CreditCard className="w-4 h-4" /> Billing portal
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile")
  const { user, updateProfile } = useAuth()
  const [profileName, setProfileName] = useState(user?.name ?? "")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const handleSaveProfile = async () => {
    setSaveState("saving")
    const ok = await updateProfile({ name: profileName })
    setSaveState(ok ? "saved" : "error")
    if (ok) setTimeout(() => setSaveState("idle"), 3000)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors text-left ${
                activeSection === section.id
                  ? "bg-[rgb(var(--primary))]/10 border-[rgb(var(--primary))]/40 text-[rgb(var(--primary))]"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <section.icon className="w-5 h-5" />
              <span className="font-medium">{section.name}</span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6">
          {activeSection === "billing" ? (
            <BillingPanel />
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-6">
                {sections.find(s => s.id === activeSection)?.name} Settings
              </h2>
              {activeSection === "profile" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Display Name</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Email</label>
                    <input
                      type="email"
                      value={user?.email ?? ""}
                      readOnly
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl opacity-60 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">Contact support to change your email address.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveProfile}
                      disabled={saveState === "saving"}
                      className="px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium disabled:opacity-50 transition-opacity"
                    >
                      {saveState === "saving" ? "Saving…" : "Save Changes"}
                    </button>
                    {saveState === "saved" && <span className="text-green-400 text-sm">Profile updated!</span>}
                    {saveState === "error" && <span className="text-red-400 text-sm">Failed to save. Try again.</span>}
                  </div>
                </div>
              )}
              {activeSection !== "profile" && (
                <p className="text-[rgb(var(--muted-foreground))] text-sm">
                  {sections.find(s => s.id === activeSection)?.name} configuration coming soon.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
