import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Send,
    Sparkles,
    User,
    Copy,
    Check,
    Loader2,
    RefreshCw,
    ThumbsUp,
    ThumbsDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/context/AuthContext"
import { getCrawlResults, type CrawlResult } from "@/lib/firestore"
import { chatWithPapers } from "@/lib/api"

interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    timestamp: Date
    suggestions?: string[]
}

const suggestedQuestions = [
    "Which research gaps appear across multiple NeurIPS papers?",
    "What are the most common data-related limitations?",
    "Find gaps related to model scalability",
    "Which problems might be solvable now with newer techniques?",
    "Summarize the compute-related research gaps"
]

export function AssistantPage() {
    const { user } = useAuth()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isTyping, setIsTyping] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [papers, setPapers] = useState<CrawlResult[]>([])
    const [isLoadingPapers, setIsLoadingPapers] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    useEffect(() => {
        async function loadPapers() {
            if (!user) return
            try {
                const results = await getCrawlResults(user.id)
                setPapers(results)
            } catch (error) {
                console.error("Failed to load papers:", error)
            } finally {
                setIsLoadingPapers(false)
            }
        }
        loadPapers()
    }, [user])

    const handleSend = async (text: string = input) => {
        if (!text.trim()) return

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: text,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInput("")
        setIsTyping(true)

        try {
            const paperContext = papers.map(p => ({
                title: p.title,
                content: p.content,
                gaps: p.gaps,
                venue: p.venue
            }))

            const responseText = await chatWithPapers(
                text,
                paperContext,
                messages.map(m => ({ role: m.role, content: m.content }))
            )

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: responseText,
                timestamp: new Date(),
                suggestions: []
            }

            setMessages(prev => [...prev, assistantMessage])
        } catch (error) {
            console.error("Chat error:", error)
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "Sorry, I encountered an error while processing your request.",
                timestamp: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsTyping(false)
        }
    }

    const handleCopy = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div className="min-h-screen py-12">
            <div className="container-wide">
                {/* Header */}
                <div className="mb-8">
                    <div className="section-number mb-4">AI ASSISTANT</div>
                    <h1 className="heading-section mb-4">
                        Research Gap
                        <br />
                        <span className="gradient-text">Assistant</span>
                    </h1>
                    <p className="text-lg text-[rgb(var(--text-secondary))] max-w-2xl">
                        Ask questions about extracted research gaps. Get insights, find patterns,
                        and discover connections across your paper corpus.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chat Area */}
                    <div className="lg:col-span-2">
                        <Card className="h-[600px] flex flex-col">
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[rgb(249 115 22)] to-[rgb(245 158 11)] mb-4">
                                            <Sparkles className="h-8 w-8 text-white" />
                                        </div>
                                        <h3 className="font-semibold text-lg mb-2">
                                            Research Assistant Ready
                                        </h3>
                                        <p className="text-[rgb(var(--text-secondary))] mb-6 max-w-sm">
                                            {isLoadingPapers
                                                ? "Loading your papers..."
                                                : `Ready to analyze ${papers.length} papers. Ask me anything about research gaps.`
                                            }
                                        </p>
                                        <div className="flex flex-wrap gap-2 justify-center max-w-md">
                                            {suggestedQuestions.slice(0, 3).map((q, i) => (
                                                <Button
                                                    key={i}
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-xs whitespace-normal text-left h-auto"
                                                    onClick={() => handleSend(q)}
                                                >
                                                    {q}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <AnimatePresence>
                                    {messages.map((msg) => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                                        >
                                            {msg.role === "assistant" && (
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[rgb(249 115 22)] to-[rgb(245 158 11)]">
                                                    <Sparkles className="h-4 w-4 text-white" />
                                                </div>
                                            )}
                                            <div
                                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user"
                                                    ? "bg-[rgb(249 115 22)] text-white"
                                                    : "bg-[rgb(255 255 255 / 0.06)]"
                                                    }`}
                                            >
                                                <div className="whitespace-pre-wrap text-sm">
                                                    {msg.content}
                                                </div>
                                                {msg.role === "assistant" && (
                                                    <div className="mt-3 flex items-center gap-2 border-t border-[rgb(255 255 255 / 0.08)] pt-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 gap-1 text-xs"
                                                            onClick={() => handleCopy(msg.content, msg.id)}
                                                        >
                                                            {copiedId === msg.id ? (
                                                                <Check className="h-3 w-3" />
                                                            ) : (
                                                                <Copy className="h-3 w-3" />
                                                            )}
                                                            Copy
                                                        </Button>
                                                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                                            <ThumbsUp className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                                            <ThumbsDown className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                                {msg.suggestions && msg.suggestions.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {msg.suggestions.map((s, i) => (
                                                            <Button
                                                                key={i}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-6 text-[10px]"
                                                                onClick={() => handleSend(s)}
                                                            >
                                                                {s}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {msg.role === "user" && (
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(255 255 255 / 0.06)]">
                                                    <User className="h-4 w-4" />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                {isTyping && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex gap-3"
                                    >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[rgb(249 115 22)] to-[rgb(245 158 11)]">
                                            <Sparkles className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="rounded-2xl bg-[rgb(255 255 255 / 0.06)] px-4 py-3">
                                            <div className="flex gap-1">
                                                <motion.div
                                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                                    transition={{ duration: 1, repeat: Infinity }}
                                                    className="h-2 w-2 rounded-full bg-[rgb(var(--text-secondary))]"
                                                />
                                                <motion.div
                                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                                                    className="h-2 w-2 rounded-full bg-[rgb(var(--text-secondary))]"
                                                />
                                                <motion.div
                                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                                                    className="h-2 w-2 rounded-full bg-[rgb(var(--text-secondary))]"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="border-t border-[rgb(255 255 255 / 0.08)] p-4">
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleSend() }}
                                    className="flex gap-2"
                                >
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Ask about research gaps..."
                                        className="flex-1 rounded-lg border border-[rgb(255 255 255 / 0.08)] bg-transparent px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(249 115 22)]"
                                        disabled={isTyping}
                                    />
                                    <Button type="submit" disabled={!input.trim() || isTyping}>
                                        {isTyping ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                    </Button>
                                </form>
                            </div>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    Suggested Questions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {suggestedQuestions.map((q, i) => (
                                    <Button
                                        key={i}
                                        variant="ghost"
                                        className="w-full justify-start text-left h-auto py-2 text-sm font-normal whitespace-normal break-words"
                                        onClick={() => handleSend(q)}
                                    >
                                        {q}
                                    </Button>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    Recent Insights
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {papers.length > 0 ? (
                                    <div className="space-y-1">
                                        <Badge variant="secondary" className="text-[10px]">
                                            Context Loaded
                                        </Badge>
                                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                                            {papers.length} papers loaded into context.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <p className="text-xs text-[rgb(var(--text-secondary))]">
                                            No papers loaded yet. Crawl some papers to get started.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
