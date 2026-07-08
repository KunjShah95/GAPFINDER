import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Sparkles, ArrowRight, Play } from "lucide-react"
import React from "react"

/**
 * Signature hero (PRIME mode) — named: "FluxRibbon"
 * - Distinct silhouette: diagonal ribbon + clipped display type
 * - Accessible, responsive (320px+)
 */
export function PrimeHero() {
  const navigate = useNavigate()

  return (
    <section className="relative overflow-hidden pt-20 pb-8" role="banner" aria-label="Primary site hero">
      {/* atmospheric grain + ribbon */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(221,83,53,0.04),transparent 35%)]" />
        <div className="absolute -left-40 top-8 w-[120%] h-64 transform rotate-[var(--motif-shape)] opacity-40" style={{background: 'linear-gradient(90deg, rgba(221,83,53,0.12), rgba(139,92,246,0.06))', filter: 'blur(36px)'}} />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <motion.div className="lg:col-span-7" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.6}}>
            <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-[rgb(var(--card))] glass border border-[rgb(var(--border))] mb-6">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[linear-gradient(135deg,rgb(var(--primary)),rgb(139,92,246))] text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold">PRIME · Research Synthesis</span>
            </div>

            <h1 className="font-display text-[clamp(1.5rem,6.5vw,4.25rem)] leading-tight tracking-tight mb-4">
              <span className="block -translate-y-1">Discover the</span>
              <span className="block gradient-text">unsolved questions</span>
              <span className="block text-lg mt-2 text-[rgb(var(--muted-foreground))] max-w-[55ch]">From method blindspots to dataset failures — surface the research opportunities that matter.</span>
            </h1>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-6">
              <button onClick={() => navigate('/dashboard')} className="btn btn-primary w-full sm:w-auto px-6 py-3 text-base flex items-center justify-center gap-2" aria-label="Start discovering">
                Start discovering
                <ArrowRight className="w-4 h-4" />
              </button>

              <button aria-label="Watch demo" className="btn btn-secondary w-full sm:w-auto px-5 py-3 text-base flex items-center justify-center gap-2">
                <Play className="w-4 h-4" />
                Watch demo
              </button>
            </div>
          </motion.div>

          <motion.div initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} transition={{duration:0.6, delay:0.08}} className="lg:col-span-5">
            <div className="rounded-[var(--system-radius-lg)] border border-[rgb(var(--border))] p-6 bg-[rgb(var(--card))]">
              <div className="text-sm text-[rgb(var(--muted-foreground))] mb-3">Snapshot</div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-bold gradient-text">50K+</div>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">Papers analyzed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold gradient-text">200K+</div>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">Gaps discovered</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-[rgb(var(--muted-foreground))]">Signature: FluxRibbon — diagonal atmospheric ribbon and expressive display typography that becomes the product's visual anchor.</div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default PrimeHero
