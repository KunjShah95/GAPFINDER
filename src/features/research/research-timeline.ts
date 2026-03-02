// Research Timeline - Track evolution of research over time
export interface TimelineEvent {
  id: string
  type: "paper" | "breakthrough" | "dataset" | "tool" | "award" | "conference"
  title: string
  description: string
  date: Date
  year: number
  impact: "high" | "medium" | "low"
  category: string
  papers?: string[]
  citations?: number
}

export interface ResearchTimeline {
  topic: string
  events: TimelineEvent[]
  statistics: {
    totalEvents: number
    papersPublished: number
    breakthroughs: number
    activeYears: number
    avgPapersPerYear: number
  }
  phases: Array<{
    name: string
    startYear: number
    endYear: number
    description: string
    keyDevelopments: string[]
  }>
}

export interface TimelineFilter {
  types?: Array<TimelineEvent["type"]>
  impact?: Array<TimelineEvent["impact"]>
  categories?: string[]
  yearRange?: { start: number; end: number }
}

// Generate demo timeline
export function generateTimeline(topic: string): ResearchTimeline {
  const events: TimelineEvent[] = []

  // Foundational work
  events.push({
    id: "event-1",
    type: "paper",
    title: `${topic}: Foundations`,
    description: "Initial theoretical framework established",
    date: new Date(2015, 5, 15),
    year: 2015,
    impact: "high",
    category: "Theory",
    citations: 5000,
  })

  // Dataset releases
  events.push({
    id: "event-2",
    type: "dataset",
    title: `${topic} Benchmark Dataset`,
    description: "Standardized benchmark for evaluation",
    date: new Date(2016, 3, 20),
    year: 2016,
    impact: "high",
    category: "Resources",
  })

  // Major papers
  for (let year = 2016; year <= 2025; year++) {
    const paperCount = Math.floor(Math.random() * 5) + 1
    for (let i = 0; i < paperCount; i++) {
      events.push({
        id: `event-${year}-${i}`,
        type: "paper",
        title: `Advances in ${topic} (${year})`,
        description: `Key developments in ${topic} for ${year}`,
        date: new Date(year, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28)),
        year,
        impact: Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low",
        category: "Research",
        citations: Math.floor(Math.random() * 500) + 10,
      })
    }
  }

  // Breakthroughs
  events.push(
    {
      id: "breakthrough-1",
      type: "breakthrough",
      title: `${topic}: Transformer Architecture`,
      description: "Novel architecture revolutionizes the field",
      date: new Date(2017, 5, 12),
      year: 2017,
      impact: "high",
      category: "Architecture",
    },
    {
      id: "breakthrough-2",
      type: "breakthrough",
      title: `Large-scale ${topic} Models`,
      description: "Scaling laws discovered for ${topic}",
      date: new Date(2020, 3, 15),
      year: 2020,
      impact: "high",
      category: "Scaling",
    }
  )

  // Conferences
  events.push({
    id: "conf-1",
    type: "conference",
    title: `${topic} Summit`,
    description: "Major conference showcasing latest research",
    date: new Date(2023, 9, 10),
    year: 2023,
    impact: "medium",
    category: "Community",
  })

  const sortedEvents = events.sort((a, b) => a.date.getTime() - b.date.getTime())

  const paperEvents = sortedEvents.filter(e => e.type === "paper")
  const breakthroughEvents = sortedEvents.filter(e => e.type === "breakthrough")
  const years = new Set(sortedEvents.map(e => e.year)).size
  const totalPapers = paperEvents.length

  return {
    topic,
    events: sortedEvents,
    statistics: {
      totalEvents: sortedEvents.length,
      papersPublished: totalPapers,
      breakthroughs: breakthroughEvents.length,
      activeYears: years,
      avgPapersPerYear: Math.round(totalPapers / years),
    },
    phases: [
      {
        name: "Foundation (2015-2017)",
        startYear: 2015,
        endYear: 2017,
        description: "Early theoretical work and initial architectures",
        keyDevelopments: ["Initial framework", "First benchmarks", "Transformer architecture"],
      },
      {
        name: "Scaling (2018-2020)",
        startYear: 2018,
        endYear: 2020,
        description: "Focus on larger models and more data",
        keyDevelopments: ["Pre-training paradigms", "Large-scale datasets", "Transfer learning"],
      },
      {
        name: "Refinement (2021-2023)",
        startYear: 2021,
        endYear: 2023,
        description: "Efficiency and specialized applications",
        keyDevelopments: ["Efficient architectures", "Domain adaptation", "Practical deployments"],
      },
      {
        name: "Integration (2024-Present)",
        startYear: 2024,
        endYear: 2025,
        description: "Multimodal and unified approaches",
        keyDevelopments: ["Multimodal models", "Foundation models", "General-purpose systems"],
      },
    ],
  }
}

export function filterTimeline(
  timeline: ResearchTimeline,
  filters: TimelineFilter
): ResearchTimeline {
  let filtered = timeline.events

  if (filters.types && filters.types.length > 0) {
    filtered = filtered.filter(e => filters.types!.includes(e.type))
  }

  if (filters.impact && filters.impact.length > 0) {
    filtered = filtered.filter(e => filters.impact!.includes(e.impact))
  }

  if (filters.categories && filters.categories.length > 0) {
    filtered = filtered.filter(e => filters.categories!.includes(e.category))
  }

  if (filters.yearRange) {
    filtered = filtered.filter(
      e => e.year >= filters.yearRange!.start && e.year <= filters.yearRange!.end
    )
  }

  return {
    ...timeline,
    events: filtered,
    statistics: {
      ...timeline.statistics,
      totalEvents: filtered.length,
      papersPublished: filtered.filter(e => e.type === "paper").length,
    },
  }
}

export function getTimelineStats(
  timeline: ResearchTimeline
): Array<{ year: number; papers: number; citations: number; breakthroughs: number }> {
  const yearStats = new Map<number, { papers: number; citations: number; breakthroughs: number }>()

  timeline.events.forEach(event => {
    const current = yearStats.get(event.year) || { papers: 0, citations: 0, breakthroughs: 0 }
    if (event.type === "paper") current.papers++
    if (event.type === "breakthrough") current.breakthroughs++
    if (event.citations) current.citations += event.citations
    yearStats.set(event.year, current)
  })

  return Array.from(yearStats.entries())
    .map(([year, stats]) => ({ year, ...stats }))
    .sort((a, b) => a.year - b.year)
}

export function identifyKeyMilestones(
  timeline: ResearchTimeline
): TimelineEvent[] {
  return timeline.events
    .filter(e => e.impact === "high" || e.type === "breakthrough")
    .slice(0, 10)
}

export function calculateResearchMaturity(
  timeline: ResearchTimeline
): "emerging" | "growing" | "mature" | "saturated" {
  const { statistics, phases } = timeline

  // Calculate growth rate
  const recentYears = timeline.events
    .filter(e => e.year >= 2022)
    .length / 3
  const earlierYears = timeline.events
    .filter(e => e.year < 2020)
    .length / 5

  const growthRate = recentYears / Math.max(earlierYears, 1)

  // Check for standardization
  const hasBenchmarks = timeline.events.some(e => e.type === "dataset")
  const hasConferences = timeline.events.some(e => e.type === "conference")

  if (growthRate > 2 && hasBenchmarks && hasConferences) return "mature"
  if (growthRate > 1.5) return "growing"
  if (statistics.papersPublished < 50) return "emerging"
  return "saturated"
}

export function generateTimelineSummary(timeline: ResearchTimeline): string {
  const maturity = calculateResearchMaturity(timeline)
  const milestones = identifyKeyMilestones(timeline)

  return `# Research Timeline: ${timeline.topic}

## Overview
- **Total Publications**: ${timeline.statistics.papersPublished}
- **Breakthroughs**: ${timeline.statistics.breakthroughs}
- **Active Years**: ${timeline.statistics.activeYears}
- **Maturity Level**: ${maturity.charAt(0).toUpperCase() + maturity.slice(1)}

## Key Milestones
${milestones.map((m, i) => `${i + 1}. **${m.year}**: ${m.title}`).join("\n")}

## Research Phases
${timeline.phases.map(p => `- **${p.name}**: ${p.description}`).join("\n")}

## Recommendations
${maturity === "emerging" ? "- Field is early-stage. Focus on foundational work." : ""}
${maturity === "growing" ? "- Field is expanding rapidly. Identify niches." : ""}
${maturity === "mature" ? "- Well-established field. Look for integration opportunities." : ""}
${maturity === "saturated" ? "- Consider adjacent domains or fundamental shifts." : ""}
`
}
