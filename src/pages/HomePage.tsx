import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import {
  ArrowRight,
  Sparkles,
  FileText,
  Lightbulb,
  Network,
  GitBranch,
  MessageSquare,
  BookOpen,
  ChevronRight,
  Check,
  Play
} from "lucide-react"
import { PrimeHero } from "@/components/layout/PrimeHero"

const publicNavItems = [
  { name: "Features", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Pricing", href: "/pricing" },
]

const stats = [
  { value: "50K+", label: "Papers Analyzed", change: "+12%" },
  { value: "200K+", label: "Gaps Discovered", change: "+28%" },
  { value: "10K+", label: "Researchers", change: "+18%" },
  { value: "98%", label: "Accuracy Rate", change: "+2%" },
]

const features = [
  {
    icon: FileText,
    title: "Batch Paper Crawling",
    description: "Paste multiple URLs and extract limitations from papers in parallel. Support for arXiv, OpenReview, NeurIPS, ACL, and more.",
    metric: "1000+ papers/hour"
  },
  {
    icon: Lightbulb,
    title: "AI Gap Detection",
    description: "Gemini-powered analysis transforms raw limitations into clean, actionable problem statements automatically.",
    metric: "99.2% precision"
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Visualize relationships between papers, authors, and concepts with interactive graph exploration.",
    metric: "1M+ connections"
  },
  {
    icon: GitBranch,
    title: "Research Workflows",
    description: "Automate your literature review with customizable pipelines from crawling to gap analysis.",
    metric: "10x faster"
  },
  {
    icon: MessageSquare,
    title: "AI Research Assistant",
    description: "Chat with AI about your paper library. Ask questions, get summaries, and discover connections.",
    metric: "24/7 available"
  },
  {
    icon: BookOpen,
    title: "Literature Reviews",
    description: "Auto-generate Related Work sections with proper citations and gap analysis.",
    metric: "5min vs 2 weeks"
  },
]

const trustedBy = [
  "Stanford", "MIT", "DeepMind", "OpenAI", "Google Research", "Meta AI", "Berkeley", "CMU"
]

const testimonials = [
  {
    quote: "GapMiner transformed how I approach literature review. Found my PhD topic in an afternoon instead of months.",
    author: "Dr. Sarah Chen",
    role: "ML Researcher, Stanford",
    avatar: "SC"
  },
  {
    quote: "The cross-paper insights are incredible. It surfaces patterns that would take weeks to find manually.",
    author: "Prof. James Miller",
    role: "Computer Science, MIT",
    avatar: "JM"
  },
  {
    quote: "Essential tool for our research lab. The automated gap detection has accelerated our project scoping significantly.",
    author: "Dr. Emily Johnson",
    role: "Research Director, DeepMind",
    avatar: "EJ"
  },
]

export function HomePage() {
  const { isAuthenticated, user, setShowAuthModal, setAuthModalMode } = useAuth()
  const navigate = useNavigate()

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard")
    } else {
      setAuthModalMode("register")
      setShowAuthModal(true)
    }
  }

  const handleSignIn = () => {
    setAuthModalMode("login")
    setShowAuthModal(true)
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--background))]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgb(var(--background))]/80 backdrop-blur-md border-b border-[rgb(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[linear-gradient(135deg,rgb(var(--primary)),rgb(139,92,246))] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg">GapMiner</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              {publicNavItems.map((item) => (
                item.href.startsWith('/') ? (
                  <Link key={item.name} to={item.href} className="text-sm text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors">
                    {item.name}
                  </Link>
                ) : (
                  <a key={item.name} href={item.href} className="text-sm text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors">
                    {item.name}
                  </a>
                )
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSignIn} className="btn-ghost text-sm">
                Sign in
              </button>
              <button onClick={handleGetStarted} className="btn-primary text-sm">
                Get started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <PrimeHero />

      {/* Stats */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6"
          >
            {stats.map((stat, i) => (
              <div key={i} className="metric-card text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text mb-1">{stat.value}</div>
                <div className="text-sm text-[rgb(var(--muted-foreground))]">{stat.label}</div>
                <div className="text-xs text-green-600 mt-1">{stat.change}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[rgb(var(--muted))]/30">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything you need to accelerate research
            </h2>
            <p className="text-lg text-[rgb(var(--muted-foreground))]">
              Powerful features designed for researchers, built by researchers.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card card-hover p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-[rgb(var(--primary))]/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-[rgb(var(--primary))]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-[rgb(var(--muted-foreground))] mb-4">{feature.description}</p>
                <div className="text-xs font-mono text-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10 px-2 py-1 rounded inline-block">
                  {feature.metric}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              From paper to insight in three steps
            </h2>
            <p className="text-lg text-[rgb(var(--muted-foreground))]">
              Get started in minutes. No complex setup required.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Paste URLs", desc: "Add research paper URLs from arXiv, OpenReview, or conference websites." },
              { step: "02", title: "AI Analysis", desc: "Our AI engine extracts limitations, future work, and research gaps automatically." },
              { step: "03", title: "Discover & Export", desc: "Browse, filter, and export discovered gaps. Build collections and track themes." },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative"
              >
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-[rgb(var(--border))]" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-[rgb(var(--muted))]/50 mb-6 relative">
                    <span className="text-4xl font-bold text-[rgb(var(--primary))]/20">{item.step}</span>
                    <div className="absolute inset-0 rounded-2xl border border-[rgb(var(--border))]" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-sm text-[rgb(var(--muted-foreground))] leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <button onClick={handleGetStarted} className="btn-primary px-8 py-3">
              Try it free
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[rgb(var(--muted))]/30">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Trusted by researchers worldwide
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card p-6"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-yellow-500 fill-current" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-[rgb(var(--foreground))] mb-6 leading-relaxed">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,rgb(var(--primary)),rgb(139,92,246))] flex items-center justify-center text-white font-medium text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{t.author}</div>
                    <div className="text-xs text-[rgb(var(--muted-foreground))]">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-16">
            <p className="text-center text-sm text-[rgb(var(--muted-foreground))] mb-8">
              Trusted by researchers at leading institutions
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-50">
              {trustedBy.map((org, i) => (
                <div key={i} className="text-sm font-medium text-[rgb(var(--muted-foreground))]">
                  {org}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-[rgb(var(--muted-foreground))]">
              Choose the plan that fits your research needs.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: "Starter",
                price: "$0",
                desc: "For individual researchers",
                features: ["50 papers/month", "Basic AI analysis", "Standard extraction", "Export to CSV"],
                cta: "Start free",
                popular: false
              },
              {
                name: "Pro",
                price: "$29",
                desc: "For serious researchers",
                features: ["Unlimited papers", "Advanced AI insights", "Cross-paper analysis", "Priority extraction", "PDF reports"],
                cta: "Get Pro",
                popular: true
              },
              {
                name: "Team",
                price: "$99",
                desc: "For research groups",
                features: ["Everything in Pro", "5 team members", "Collaborative collections", "API access", "Dedicated support"],
                cta: "Contact sales",
                popular: false
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`card p-6 relative ${plan.popular ? 'border-[rgb(var(--primary))] shadow-lg shadow-[rgb(var(--primary))]/10' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[rgb(var(--primary))] text-white text-xs font-medium rounded-full">
                    Most popular
                  </div>
                )}
                <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-[rgb(var(--muted-foreground))]">/month</span>
                </div>
                <p className="text-sm text-[rgb(var(--muted-foreground))] mb-6">{plan.desc}</p>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-[rgb(var(--primary))] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={handleGetStarted} className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  plan.popular
                    ? 'bg-[rgb(var(--primary))] text-white hover:opacity-90'
                    : 'bg-[rgb(var(--muted))] hover:bg-[rgb(var(--muted-foreground))]/10'
                }`}>
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-8 sm:p-12 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--primary))/5,rgb(139,92,246)/5)]" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Ready to discover your next breakthrough?
              </h2>
              <p className="text-[rgb(var(--muted-foreground))] mb-8 max-w-xl mx-auto">
                Join thousands of researchers who use GapMiner to accelerate their literature review and find research gaps faster.
              </p>
              <button onClick={handleGetStarted} className="btn-primary px-8 py-3">
                Get started free
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-[rgb(var(--border))]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[linear-gradient(135deg,rgb(var(--primary)),rgb(139,92,246))] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold">GapMiner</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-[rgb(var(--muted-foreground))]">
              <a href="#" className="hover:text-[rgb(var(--foreground))] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[rgb(var(--foreground))] transition-colors">Terms</a>
              <a href="#" className="hover:text-[rgb(var(--foreground))] transition-colors">Contact</a>
            </div>

            <p className="text-sm text-[rgb(var(--muted-foreground))]">
              © 2024 GapMiner. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
