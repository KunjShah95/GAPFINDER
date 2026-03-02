import { Component, type ErrorInfo, type ReactNode } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, RefreshCcw, Home } from "lucide-react"
import { Button } from "./ui/button"
import * as Sentry from "@sentry/react"

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo)
        
        Sentry.captureException(error, {
            extra: {
                componentStack: errorInfo.componentStack,
            },
        })
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null })
        window.location.href = "/"
    }

    private handleReload = () => {
        window.location.reload()
    }

    public render() {
        if (this.state.hasError) {
            // Check if it's a chunk load error
            const isChunkError = this.state.error?.message?.includes("Loading chunk") ||
                this.state.error?.message?.includes("Failed to fetch dynamically imported module")

            return (
                <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(var(--background))]">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-md w-full text-center space-y-6"
                    >
                        <div className="inline-flex items-center justify-center p-4 rounded-full bg-red-500/10 text-red-500 mb-4">
                            <AlertTriangle className="h-12 w-12" />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {isChunkError ? "App Update Required" : "Something went wrong"}
                            </h1>
                            <p className="text-[hsl(var(--muted-foreground))]">
                                {isChunkError
                                    ? "We've released a new version of GapMiner. Please reload to stay up to date."
                                    : "An unexpected error occurred. Our team has been notified."}
                            </p>
                        </div>

                        {this.state.error && (
                            <div className="p-4 rounded-xl bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] text-xs text-left overflow-auto max-h-32 font-mono opacity-60">
                                {this.state.error.toString()}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                            <Button
                                onClick={this.handleReload}
                                className="gap-2 bg-[hsl(var(--brand-primary))] hover:bg-[hsl(var(--brand-primary))]/90"
                            >
                                <RefreshCcw className="h-4 w-4" />
                                Reload Application
                            </Button>
                            <Button
                                variant="outline"
                                onClick={this.handleReset}
                                className="gap-2"
                            >
                                <Home className="h-4 w-4" />
                                Go to Home
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )
        }

        return this.props.children
    }
}
