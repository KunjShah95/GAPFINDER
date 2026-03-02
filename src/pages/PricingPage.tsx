import { motion } from "framer-motion"
import { Check, X, Sparkles, ArrowRight, Zap, Users, Building2, Star } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { useSubscription } from "@/context/SubscriptionContext"
import type { SubscriptionTier } from "@/lib/subscription"

// ─── Plan definitions ───────────────────────────────────────────────────────

interface PlanFeature {
  label: string
  free: string | boolean
  pro: string | boolean
  team: string | boolean
  enterprise: string | boolean
}

const PLAN_FEATURES: PlanFeature[] = [
  // Core
  { label: "Papers per month",         free: "50",       pro: "500",      team: "2,000",    enterprise: "Unlimited" },
  { label: "Gaps per paper",           free: "10",       pro: "50",       team: "100",      enterprise: "Unlimited" },
  { label: "Collections",             free: "5",        pro: "50",       team: "200",      enterprise: "Unlimited" },
  { label: "History retention",        free: "30 days",  pro: "1 year",   team: "2 years",  enterprise: "Unlimited" },
  // Latest Papers / Cron Feed
  { label: "Publisher feeds",          free: "2 (arXiv, PubMed)", pro: "5", team: "All 8",  enterprise: "All + custom" },
  { label: "Manual feed refresh",      free: false,      pro: true,       team: true,       enterprise: true },
  // Alerts
  { label: "Research alerts",          free: "3",        pro: "20",       team: "50",       enterprise: "Unlimited" },
  // AI & Chat
  { label: "AI chat messages/month",   free: "20",       pro: "500",      team: "2,000",    enterprise: "Unlimited" },
  { label: "Priority AI processing",   free: false,      pro: true,       team: true,       enterprise: true },
  // Workflows & Automation
  { label: "Saved workflows",          free: "2",        pro: "20",       team: "100",      enterprise: "Unlimited" },
  // Knowledge Graph
  { label: "Knowledge graph nodes",    free: "100",      pro: "1,000",    team: "5,000",    enterprise: "Unlimited" },
  // Exports
  { label: "Export formats",           free: "CSV",      pro: "CSV, JSON, PDF", team: "CSV, JSON, PDF, MD", enterprise: "All + API" },
  // Advanced Features
  { label: "Competitor analysis",      free: false,      pro: true,       team: true,       enterprise: true },
  { label: "Grant matching",           free: false,      pro: true,       team: true,       enterprise: true },
  { label: "Impact prediction",        free: false,      pro: false,      team: true,       enterprise: true },
  { label: "API access",               free: false,      pro: true,       team: true,       enterprise: true },
  // Team
  { label: "Team members",             free: "1",        pro: "1",        team: "10",       enterprise: "Unlimited" },
  { label: "Shared collections",       free: false,      pro: false,      team: true,       enterprise: true },
  // Support
  { label: "Support",                  free: "Community", pro: "Email",   team: "Priority email", enterprise: "Dedicated CSM" },
  { label: "SLA",                      free: false,      pro: false,      team: false,      enterprise: true },
]

interface Plan {
  id: SubscriptionTier
  name: string
  price: string
  annualPrice: string
  desc: string
  icon: React.FC<{ className?: string }>
  badge?: string
  color: string
  cta: string
  ctaVariant: "primary" | "outline" | "secondary" | "gradient"
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    price: "$0",
    annualPrice: "$0",
    desc: "Perfect for individual researchers exploring AI-powered gap discovery.",
    icon: Sparkles,
    color: "from-slate-500 to-slate-600",
    cta: "Get started free",
    ctaVariant: "outline",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    annualPrice: "$23",
    desc: "For serious researchers who need deeper analysis and more sources.",
    icon: Zap,
    badge: "Most popular",
    color: "from-violet-500 to-fuchsia-500",
    cta: "Start Pro trial",
    ctaVariant: "gradient",
  },
  {
    id: "team",
    name: "Team",
    price: "$99",
    annualPrice: "$79",
    desc: "For research groups and labs collaborating on multiple projects.",
    icon: Users,
    color: "from-blue-500 to-cyan-500",
    cta: "Start team trial",
    ctaVariant: "primary",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    annualPrice: "Custom",
    desc: "For institutions and organizations with advanced security and scale requirements.",
    icon: Building2,
    color: "from-amber-500 to-orange-500",
    cta: "Contact sales",
    ctaVariant: "secondary",
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="w-5 h-5 text-emerald-400 mx-auto" />
  if (value === false) return <X    className="w-4 h-4 text-slate-600 mx-auto" />
  return <span className="text-sm text-slate-300">{value}</span>
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalMode } = useAuth()
  const { tier: currentTier, triggerUpgrade } = useSubscription()

  function handleCta(plan: Plan) {
    if (plan.id === "enterprise") {
      window.open("mailto:sales@gapminer.io?subject=Enterprise%20Inquiry", "_blank")
      return
    }
    if (!isAuthenticated) {
      setAuthModalMode("register")
      setShowAuthModal(true)
      return
    }
    if (plan.id === currentTier) {
      navigate("/settings")
      return
    }
    triggerUpgrade(`Upgrade to ${plan.name} to unlock all its features.`)
  }

  function ctaLabel(plan: Plan): string {
    if (isAuthenticated && plan.id === currentTier) return "Current plan"
    return plan.cta
  }

  function ctaDisabled(plan: Plan): boolean {
    return isAuthenticated && plan.id === currentTier
  }

  const tiers: SubscriptionTier[] = ["free", "pro", "team", "enterprise"]

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[rgb(var(--primary))]/10 border border-[rgb(var(--primary))]/20 text-sm text-[rgb(var(--primary))] mb-6">
            <Star className="w-4 h-4" />
            <span>Simple, transparent pricing</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Plans for every{" "}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              researcher
            </span>
          </h1>
          <p className="text-lg text-[rgb(var(--muted-foreground))]">
            Start free, scale as your research grows. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6 mb-20">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon
            const isCurrent = isAuthenticated && plan.id === currentTier
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`relative card p-6 flex flex-col gap-4 ${
                  plan.badge ? "border-[rgb(var(--primary))] shadow-xl shadow-[rgb(var(--primary))]/10" : ""
                } ${isCurrent ? "ring-2 ring-emerald-500/60" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[rgb(var(--primary))] text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-4 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                    Your plan
                  </div>
                )}

                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>

                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-[rgb(var(--muted-foreground))] mt-1">{plan.desc}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.price !== "Custom" && (
                    <span className="text-sm text-[rgb(var(--muted-foreground))]">/mo</span>
                  )}
                </div>
                {plan.price !== "Custom" && plan.price !== "$0" && (
                  <p className="text-xs text-[rgb(var(--muted-foreground))] -mt-3">
                    {plan.annualPrice}/mo billed annually
                  </p>
                )}

                <button
                  onClick={() => handleCta(plan)}
                  disabled={ctaDisabled(plan)}
                  className={`mt-auto w-full py-2.5 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                    ctaDisabled(plan)
                      ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                      : plan.ctaVariant === "gradient"
                      ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:opacity-90"
                      : plan.ctaVariant === "primary"
                      ? "bg-[rgb(var(--primary))] text-white hover:opacity-90"
                      : plan.ctaVariant === "secondary"
                      ? "bg-[rgb(var(--muted))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--border))]"
                      : "border border-[rgb(var(--border))] hover:bg-[rgb(var(--muted))]"
                  }`}
                >
                  {ctaLabel(plan)}
                  {!ctaDisabled(plan) && <ArrowRight className="w-4 h-4" />}
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Feature Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-10">Full feature comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--border))]">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[rgb(var(--muted-foreground))] w-2/5">
                    Feature
                  </th>
                  {PLANS.map(plan => (
                    <th key={plan.id} className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-bold">{plan.name}</span>
                        <span className="text-xs text-[rgb(var(--muted-foreground))]">
                          {plan.price === "Custom" ? "Custom" : `${plan.price}/mo`}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map((feature, i) => (
                  <tr
                    key={feature.label}
                    className={`border-b border-[rgb(var(--border))]/50 hover:bg-[rgb(var(--muted))]/30 transition-colors ${
                      i % 2 === 0 ? "" : "bg-[rgb(var(--muted))]/10"
                    }`}
                  >
                    <td className="px-6 py-3.5 text-sm text-[rgb(var(--foreground))]">{feature.label}</td>
                    {tiers.map(t => (
                      <td key={t} className="px-4 py-3.5 text-center">
                        <FeatureCell value={feature[t]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "Can I change plans at any time?",
                a: "Yes. Upgrades take effect immediately (prorated). Downgrades apply at the start of your next billing cycle.",
              },
              {
                q: "What counts as a 'paper'?",
                a: "Each URL you submit for analysis counts as one paper. Re-analyzing the same paper does not count again.",
              },
              {
                q: "What publisher feeds are included in each plan?",
                a: "Free includes arXiv and PubMed. Pro adds CrossRef, bioRxiv, and PLOS ONE. Team and Enterprise unlock all 8 publishers including Nature, IEEE, and Springer.",
              },
              {
                q: "Is there a free trial for paid plans?",
                a: "Pro and Team plans come with a 14-day free trial. No credit card required to start.",
              },
              {
                q: "Do you offer academic discounts?",
                a: "Yes — verified students and postdocs get 50% off Pro. Contact support@gapminer.io with your institutional email.",
              },
            ].map((faq, i) => (
              <div key={i} className="card p-5">
                <h3 className="font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-[rgb(var(--muted-foreground))] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 p-12"
        >
          <h2 className="text-3xl font-bold mb-4">Start discovering research gaps today</h2>
          <p className="text-[rgb(var(--muted-foreground))] mb-8 max-w-xl mx-auto">
            Join researchers at Stanford, MIT, and DeepMind who use GapMiner to accelerate their work.
          </p>
          <button
            onClick={() => {
              if (isAuthenticated) {
                navigate("/dashboard")
              } else {
                setAuthModalMode("register")
                setShowAuthModal(true)
              }
            }}
            className="btn-primary px-10 py-3 text-base"
          >
            {isAuthenticated ? "Go to Dashboard" : "Get started for free"}
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>

      </div>
    </div>
  )
}
