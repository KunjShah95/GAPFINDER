const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'src/api/gemini.ts',
  'src/api/firestore.ts',
  'src/api/gemini-client.ts',
  'src/auth/api.ts',
  'src/components/AnalysisModal.tsx',
  'src/components/ErrorBoundary.tsx',
  'src/components/FloatingAssistant.tsx',
  'src/components/ProtectedRoute.tsx',
  'src/components/layout/Footer.tsx',
  'src/components/layout/index.ts',
  'src/components/layout/Layout.tsx',
  'src/components/layout/ModernLayout.tsx',
  'src/components/layout/Navbar.tsx',
  'src/components/layout/PrimeHero.tsx',
  'src/components/ui/animated-counter.tsx',
  'src/components/ui/animated-tooltip.tsx',
  'src/components/ui/api-keys.tsx',
  'src/components/ui/auth-modal.tsx',
  'src/components/ui/background-beams.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/batch-processing.tsx',
  'src/components/ui/bento-grid.tsx',
  'src/components/ui/button.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/citation-network.tsx',
  'src/components/ui/command-palette.tsx',
  'src/components/ui/export-panel.tsx',
  'src/components/ui/hover-border-gradient.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/keyboard-shortcuts.tsx',
  'src/components/ui/knowledge-graph.tsx',
  'src/components/ui/LoadingSpinner.tsx',
  'src/components/ui/notification-center.tsx',
  'src/components/ui/onboarding.tsx',
  'src/components/ui/progress.tsx',
  'src/components/ui/research-timeline.tsx',
  'src/components/ui/research-trends.tsx',
  'src/components/ui/smart-recommendations.tsx',
  'src/components/ui/spotlight.tsx',
  'src/components/ui/tabs.tsx',
  'src/components/ui/text-generate-effect.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/theme-toggle.tsx',
  'src/components/ui/upgrade-modal.tsx',
  'src/components/ui/usage-dashboard.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/label.tsx',
  'src/context/AuthContext.tsx',
  'src/context/LanguageContext.tsx',
  'src/context/SubscriptionContext.tsx',
  'src/context/TeamContext.tsx',
  'src/features/knowledge-graph/index.ts',
  'src/features/knowledge-graph/knowledge-graph-types.ts',
  'src/features/knowledge-graph/types.ts',
  'src/features/research/author-network.ts',
  'src/features/research/citation-graph.ts',
  'src/features/research/index.ts',
  'src/features/research/paper-comparison.ts',
  'src/features/research/paper-summarizer.ts',
  'src/features/research/research-alerts.ts',
  'src/features/research/research-timeline.ts',
  'src/features/workflows/index.ts',
  'src/features/workflows/types.ts',
  'src/features/workflows/workflow-types.ts',
  'src/hooks/__tests__/hooks.test.ts',
  'src/hooks/index.ts',
  'src/hooks/useCrawlState.ts',
  'src/hooks/usePerformance.ts',
  'src/hooks/useSearch.ts',
  'src/lib/__tests__/critical-features.test.ts',
  'src/lib/__tests__/types.test.ts',
  'src/lib/ai-pipeline.ts',
  'src/lib/api-client.ts',
  'src/lib/api-keys.ts',
  'src/lib/circuit-breaker.ts',
  'src/lib/citation-extractor.ts',
  'src/lib/collaboration.ts',
  'src/lib/competitor-analysis.ts',
  'src/lib/cross-domain-analysis.ts',
  'src/lib/data-pipeline.ts',
  'src/lib/dataset-discovery.ts',
  'src/lib/deduplication.ts',
  'src/lib/embeddings.ts',
  'src/lib/export-hub.ts',
  'src/lib/export.ts',
  'src/lib/firebase.d.ts',
  'src/lib/firebase.ts',
  'src/lib/firestore.ts',
  'src/lib/gamification.ts',
  'src/lib/grant-matching.ts',
  'src/lib/grant-writer.ts',
  'src/lib/impact-predictor-types.ts',
  'src/lib/impact-predictor.ts',
  'src/lib/index.ts',
  'src/lib/lazy-safe.ts',
  'src/lib/literature-review.ts',
  'src/lib/llm-validator.ts',
  'src/lib/monitoring.ts',
  'src/lib/multi-pass-reasoning.ts',
  'src/lib/multimodal-analysis.ts',
  'src/lib/notifications.ts',
  'src/lib/observability.ts',
  'src/lib/postgres-db.ts',
  'src/lib/prompt-manager.ts',
  'src/lib/research-chat.ts',
  'src/lib/roadmap-generator.ts',
  'src/lib/sanitize.ts',
  'src/lib/secure-api.ts',
  'src/lib/sso.ts',
  'src/lib/subscription.ts',
  'src/lib/team.ts',
  'src/lib/temporal-tracking.ts',
  'src/lib/utils.ts',
  'src/lib/webhooks.ts',
  'src/pages/AdminPage.tsx',
  'src/pages/AnalyticsPage.tsx',
  'src/pages/AssistantPage.tsx',
  'src/pages/ChatPage.tsx',
  'src/pages/CollectionsPage.tsx',
  'src/pages/ComparisonPage.tsx',
  'src/pages/CompetitorPage.tsx',
  'src/pages/CrawlPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/DatasetsPage.tsx',
  'src/pages/ExplorePage.tsx',
  'src/pages/ExportPage.tsx',
  'src/pages/GapsPage.tsx',
  'src/pages/GrantsPage.tsx',
  'src/pages/HomePage.tsx',
  'src/pages/ImpactPage.tsx',
  'src/pages/index.ts',
  'src/pages/InsightsPage.tsx',
  'src/pages/KnowledgeGraphPage.tsx',
  'src/pages/KnowledgeMapPage.tsx',
  'src/pages/LiteratureReviewPage.tsx',
  'src/pages/PapersPage.tsx',
  'src/pages/RoadmapPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/pages/TeamPage.tsx',
  'src/pages/TeamSettingsPage.tsx',
  'src/pages/WorkflowsPage.tsx',
  'src/pages/AlertsPage.tsx',
  'src/pages/LeaderboardPage.tsx',
  'src/pages/AgenticResearchPage.tsx',
  'src/pages/MultiModalPage.tsx',
  'src/pages/GrantPipelinePage.tsx',
  'src/pages/ResearchMatchingPage.tsx',
  'src/pages/LiteratureReviewGeneratorPage.tsx',
  'src/pages/GapPredictionPage.tsx',
  'src/test/mocks/handlers.ts',
  'src/test/setup.ts',
  'src/types/research.ts',
  'src/utils/index.ts',
  'src/utils/validation.ts',
  'src/vite-env.d.ts',
  'src/App.tsx',
  'src/main.tsx',
  'src/sw.ts',
  'server/src/config.ts',
  'server/src/db/client.ts',
  'server/src/db/migrate.ts',
  'server/src/db/seed.ts',
  'server/src/index.ts',
  'server/src/middleware/api-auth.ts',
  'server/src/middleware/auth.ts',
  'server/src/routes/ai.ts',
  'server/src/routes/alerts.ts',
  'server/src/routes/auth.ts',
  'server/src/routes/collections.ts',
  'server/src/routes/community.ts',
  'server/src/routes/gaps.ts',
  'server/src/routes/organizations.ts',
  'server/src/routes/papers.ts',
  'server/src/routes/public-api.ts',
  'server/src/services/alert-runner.ts',
  'server/src/services/paper-sync.ts',
  'vite.config.ts',
  'vitest.config.ts',
  'eslint.config.js'
];

function removeComments(code) {
  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    // Check for string literals
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      result += code[i];
      i++;

      while (i < len) {
        if (code[i] === '\\' && i + 1 < len) {
          result += code[i] + code[i + 1];
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          result += code[i];
          i++;
          break;
        }
        result += code[i];
        i++;
      }
      continue;
    }

    // Check for single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      // Skip until end of line
      while (i < len && code[i] !== '\n') {
        i++;
      }
      // Keep the newline
      if (i < len) {
        result += code[i];
        i++;
      }
      continue;
    }

    // Check for multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      // Skip until */
      while (i < len) {
        if (code[i] === '*' && code[i + 1] === '/') {
          i += 2;
          break;
        }
        // Preserve newlines for line count
        if (code[i] === '\n') {
          result += code[i];
        }
        i++;
      }
      continue;
    }

    // Check for regex literals (basic detection)
    if (code[i] === '/' && i > 0) {
      const prevChar = result[result.length - 1];
      // Check if this could be a regex (after =, (, [, ,, ;, :, !, &, |, {, }, etc.)
      if (/[=(:,;!&|{}[\n\s]/.test(prevChar) || result.length === 0) {
        // Try to parse as regex
        let regexEnd = i + 1;
        let isRegex = true;
        while (regexEnd < len) {
          if (code[regexEnd] === '\\') {
            regexEnd += 2;
            continue;
          }
          if (code[regexEnd] === '/') {
            // Check for flags
            regexEnd++;
            while (regexEnd < len && /[gimsuvy]/.test(code[regexEnd])) {
              regexEnd++;
            }
            break;
          }
          if (code[regexEnd] === '\n') {
            isRegex = false;
            break;
          }
          regexEnd++;
        }
        
        if (isRegex && regexEnd <= len) {
          result += code.substring(i, regexEnd);
          i = regexEnd;
          continue;
        }
      }
    }

    result += code[i];
    i++;
  }

  // Remove multiple consecutive blank lines (keep max 1)
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

  return result;
}

let processedCount = 0;
let errorCount = 0;

filesToProcess.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping (not found): ${file}`);
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const cleaned = removeComments(content);
    
    fs.writeFileSync(filePath, cleaned, 'utf8');
    processedCount++;
    console.log(`Processed: ${file}`);
  } catch (err) {
    errorCount++;
    console.error(`Error processing ${file}:`, err.message);
  }
});

console.log(`\nDone! Processed: ${processedCount}, Errors: ${errorCount}`);
