// Author Network - Visualize and analyze author collaborations
export interface Author {
  id: string
  name: string
  institution: string
  paperCount: number
  citationCount: number
  hIndex: number
  researchAreas: string[]
  collaborators: string[]
  x?: number
  y?: number
}

export interface Collaboration {
  author1: string
  author2: string
  weight: number
  papers: string[]
  firstCollaboration: number
  lastCollaboration: number
}

export interface AuthorNetwork {
  authors: Author[]
  collaborations: Collaboration[]
  metrics: {
    totalAuthors: number
    avgCollaborators: number
    density: number
    largestComponent: number
    keyPlayers: string[]
  }
}

export interface AuthorMetrics {
  totalPapers: number
  totalCitations: number
  hIndex: number
  i10Index: number
  citationsPerPaper: number
  avgCoAuthors: number
  collaborationScore: number
  researchTrend: "rising" | "stable" | "declining"
}

// Generate demo author network
export function generateAuthorNetwork(authorNames: string[]): AuthorNetwork {
  const authors: Author[] = authorNames.map((name, i) => ({
    id: `author-${i}`,
    name,
    institution: getInstitution(i),
    paperCount: Math.floor(Math.random() * 50) + 5,
    citationCount: Math.floor(Math.random() * 5000) + 100,
    hIndex: Math.floor(Math.random() * 30) + 5,
    researchAreas: getResearchAreas(i),
    collaborators: [],
  }))

  // Add prominent authors
  authors.push(
    { id: "author-pioneer", name: "Dr. Pioneer A", institution: "Stanford", paperCount: 200, citationCount: 50000, hIndex: 80, researchAreas: ["Deep Learning", "NLP"], collaborators: [] },
    { id: "author-expert", name: "Prof. Expert B", institution: "MIT", paperCount: 150, citationCount: 40000, hIndex: 70, researchAreas: ["Computer Vision", "Robotics"], collaborators: [] },
    { id: "author-rising", name: "Dr. Rising C", institution: "Berkeley", paperCount: 30, citationCount: 5000, hIndex: 25, researchAreas: ["ML Systems", "Efficiency"], collaborators: [] }
  )

  const collaborations: Collaboration[] = []

  // Generate collaborations
  for (let i = 0; i < authors.length; i++) {
    for (let j = i + 1; j < authors.length; j++) {
      if (Math.random() > 0.5) {
        const papers = Array.from({ length: Math.floor(Math.random() * 10) + 1 }, (_, k) => `paper-${i}-${j}-${k}`)
        const collab: Collaboration = {
          author1: authors[i].id,
          author2: authors[j].id,
          weight: papers.length,
          papers,
          firstCollaboration: 2018 + Math.floor(Math.random() * 5),
          lastCollaboration: 2023 + Math.floor(Math.random() * 3),
        }
        collaborations.push(collab)
        authors[i].collaborators.push(authors[j].id)
        authors[j].collaborators.push(authors[i].id)
      }
    }
  }

  const avgCollaborators = authors.reduce((sum, a) => sum + a.collaborators.length, 0) / authors.length
  const keyPlayers = authors
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 5)
    .map(a => a.id)

  return {
    authors,
    collaborations,
    metrics: {
      totalAuthors: authors.length,
      avgCollaborators: Math.round(avgCollaborators * 10) / 10,
      density: collaborations.length / (authors.length * (authors.length - 1) / 2),
      largestComponent: findLargestComponent(authors, collaborations),
      keyPlayers,
    },
  }
}

function getInstitution(index: number): string {
  const institutions = ["Stanford", "MIT", "Berkeley", "CMU", "Google", "OpenAI", "DeepMind", "Meta AI"]
  return institutions[index % institutions.length]
}

function getResearchAreas(index: number): string[] {
  const areas = [
    ["Deep Learning", "NLP"],
    ["Computer Vision", "Robotics"],
    ["ML Systems", "Efficiency"],
    ["Reinforcement Learning", "Games"],
    ["NLP", "Transformers"],
    ["Graph ML", "Knowledge Bases"],
    ["Multimodal", "Vision-Language"],
    ["Efficiency", "Compression"],
  ]
  return areas[index % areas.length]
}

function findLargestComponent(authors: Author[], collaborations: Collaboration[]): number {
  const adj = new Map<string, string[]>()
  authors.forEach(a => adj.set(a.id, []))
  collaborations.forEach(c => {
    adj.get(c.author1)?.push(c.author2)
    adj.get(c.author2)?.push(c.author1)
  })

  const visited = new Set<string>()
  let maxSize = 0

  for (const author of authors) {
    if (!visited.has(author.id)) {
      const size = dfs(author.id, adj, visited)
      maxSize = Math.max(maxSize, size)
    }
  }

  return maxSize
}

function dfs(node: string, adj: Map<string, string[]>, visited: Set<string>): number {
  visited.add(node)
  let size = 1
  for (const neighbor of adj.get(node) || []) {
    if (!visited.has(neighbor)) {
      size += dfs(neighbor, adj, visited)
    }
  }
  return size
}

export function calculateAuthorMetrics(author: Author, collaborations: Collaboration[]): AuthorMetrics {
  const authorCollabs = collaborations.filter(
    c => c.author1 === author.id || c.author2 === author.id
  )
  
  const coAuthors = new Set<string>()
  authorCollabs.forEach(c => {
    coAuthors.add(c.author1 === author.id ? c.author2 : c.author1)
  })

  const citationsPerPaper = author.paperCount > 0 
    ? Math.round(author.citationCount / author.paperCount) 
    : 0

  const collaborationScore = Math.round(
    (coAuthors.size / (author.paperCount || 1)) * 100
  )

  const recentPapers = 5 // Last 5 years
  const trend = calculateTrend(author, collaborations)

  return {
    totalPapers: author.paperCount,
    totalCitations: author.citationCount,
    hIndex: author.hIndex,
    i10Index: Math.floor(author.paperCount * 0.7),
    citationsPerPaper,
    avgCoAuthors: Math.round(coAuthors.size * 10) / 10,
    collaborationScore: Math.min(collaborationScore, 100),
    researchTrend: trend,
  }
}

function calculateTrend(author: Author, collaborations: Collaboration[]): "rising" | "stable" | "declining" {
  const recentCollabs = collaborations.filter(
    c => (c.author1 === author.id || c.author2 === author.id) && c.lastCollaboration >= 2023
  )
  const oldCollabs = collaborations.filter(
    c => (c.author1 === author.id || c.author2 === author.id) && c.lastCollaboration < 2021
  )

  if (recentCollabs.length > oldCollabs.length * 1.5) return "rising"
  if (recentCollabs.length < oldCollabs.length * 0.5) return "declining"
  return "stable"
}

export function findPotentialCollaborators(
  network: AuthorNetwork,
  authorId: string,
  limit = 5
): Array<{ author: Author; score: number; reason: string }> {
  const author = network.authors.find(a => a.id === authorId)
  if (!author) return []

  const authorAreas = new Set(author.researchAreas)
  const existingCollaborators = new Set(author.collaborators)

  const potential: Array<{ author: Author; score: number; reason: string }> = []

  for (const other of network.authors) {
    if (other.id === authorId || existingCollaborators.has(other.id)) continue

    let score = 0
    const reasons: string[] = []

    // Shared research areas
    const sharedAreas = other.researchAreas.filter(a => authorAreas.has(a))
    if (sharedAreas.length > 0) {
      score += sharedAreas.length * 20
      reasons.push(`Shared expertise: ${sharedAreas.join(", ")}`)
    }

    // Institution diversity
    if (other.institution !== author.institution) {
      score += 10
      reasons.push("Different institution")
    }

    // High impact
    if (other.citationCount > author.citationCount * 1.5) {
      score += 15
      reasons.push("High citation count")
    }

    if (score > 0) {
      potential.push({
        author: other,
        score,
        reason: reasons.join("; "),
      })
    }
  }

  return potential
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function generateCollaborationReport(network: AuthorNetwork): string {
  const { metrics } = network
  const topAuthors = metrics.keyPlayers.map(id => 
    network.authors.find(a => a.id === id)
  ).filter(Boolean)

  return `# Author Network Analysis

## Overview
- **Total Authors**: ${metrics.totalAuthors}
- **Average Collaborators**: ${metrics.avgCollaborators}
- **Network Density**: ${(metrics.density * 100).toFixed(1)}%
- **Largest Connected Component**: ${metrics.largestComponent} authors

## Key Players
${topAuthors.map(a => `- **${a?.name}** (${a?.institution}): ${a?.citationCount} citations, h-index ${a?.hIndex}`).join("\n")}

## Recommendations
${metrics.density < 0.1 ? "- Network is sparse. Consider bridging collaborations between clusters." : ""}
${metrics.largestComponent < metrics.totalAuthors * 0.8 ? "- Some authors are isolated. Facilitate cross-group collaborations." : ""}
${metrics.avgCollaborators < 3 ? "- Encourage more collaborative work." : ""}
`
}
