import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Sparkles,
    X,
    MessageSquare,
    Send,
    Loader2,
    Maximize2,
    Minimize2,
    Bot,
    Brain
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { chatWithPapers } from "@/api/gemini"
import { cn } from "@/utils"
import * as authApi from "@/auth/api"

interface Message {
    role: "user" | "assistant"
    content: string
}

interface PaperContext {
    title: string
    content: string
    venue?: string
}

export function FloatingAssistant() {
    const { user } = useAuth()
    const [isOpen, setIsOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "Hi! I'm your Research Assistant. I can help you analyze the papers in your library. What would you like to know?" }
    ])
    const [isTyping, setIsTyping] = useState(false)
    const [papers, setPapers] = useState<PaperContext[]>([])
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isTyping])

    useEffect(() => {
        async function load() {
            if (!user) return
            try {
                const response = await authApi.getPapers()
                if (response.success && response.data) {
                    const paperData = response.data.map(p => ({
                        title: p.title,
                        content: p.abstract || "",
                        venue: p.venue
                    }))
                    setPapers(paperData)
                }
            } catch {
                setPapers([])
            }
        }
        load()
    }, [user])

    const handleSend = async () => {
        if (!input.trim() || isTyping) return

        const userMsg = input.trim()
        setInput("")
        setMessages(prev => [...prev, { role: "user", content: userMsg }])
        setIsTyping(true)

        try {
            const responseText = await chatWithPapers(
                userMsg,
                papers,
                messages.map(m => ({ role: m.role, content: m.content }))
            )
            setMessages(prev => [...prev, { role: "assistant", content: responseText }])
        } catch (error) {
            setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I had trouble processing that request." }])
        } finally {
            setIsTyping(false)
        }
    }

    if (!user) return null

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className={cn(
                            "mb-2 w-[350px] shadow-2xl rounded-2xl overflow-hidden border border-[rgb(var(--border))]",
                            isExpanded ? "w-[500px] h-[600px]" : "h-[450px]"
                        )}
                    >
                        <div className="flex flex-col h-full bg-[rgb(var(--card))]/80 backdrop-blur-xl">
                            {/* Header */}
                            <div className="p-4 border-b border-[rgb(var(--border))] flex items-center justify-between bg-[rgb(var(--primary))]/10">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-[rgb(var(--primary))] text-white">
                                        <Brain className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold">Research Assistant</h3>
                                        <p className="text-xs text-[rgb(var(--muted-foreground))] flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            {papers.length} papers loaded
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="p-1.5 hover:bg-[rgb(var(--muted))] rounded transition-colors"
                                    >
                                        {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-1.5 hover:bg-[rgb(var(--muted))] rounded transition-colors"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto p-4 space-y-4"
                            >
                                {messages.map((message, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex gap-3",
                                            message.role === "assistant" ? "flex-row" : "flex-row-reverse"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                            message.role === "assistant" ? "bg-[rgb(var(--primary))]/10" : "bg-[rgb(var(--muted))]"
                                        )}>
                                            {message.role === "assistant" ? <Bot className="h-4 w-4 text-[rgb(var(--primary))]" /> : <MessageSquare className="h-4 w-4" />}
                                        </div>
                                        <div className={cn(
                                            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                                            message.role === "assistant" ? "bg-[rgb(var(--muted))]" : "bg-[rgb(var(--primary))] text-white"
                                        )}>
                                            {message.content}
                                        </div>
                                    </motion.div>
                                ))}
                                {isTyping && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex gap-3"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[rgb(var(--primary))]/10 flex items-center justify-center shrink-0">
                                            <Bot className="h-4 w-4 text-[rgb(var(--primary))]" />
                                        </div>
                                        <div className="bg-[rgb(var(--muted))] rounded-2xl px-4 py-3">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 rounded-full bg-[rgb(var(--muted-foreground))] animate-bounce" style={{ animationDelay: "0ms" }} />
                                                <span className="w-2 h-2 rounded-full bg-[rgb(var(--muted-foreground))] animate-bounce" style={{ animationDelay: "150ms" }} />
                                                <span className="w-2 h-2 rounded-full bg-[rgb(var(--muted-foreground))] animate-bounce" style={{ animationDelay: "300ms" }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>

                            {/* Input */}
                            <div className="p-4 border-t border-[rgb(var(--border))]">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                        placeholder="Ask about your research..."
                                        className="flex-1 px-4 py-2 bg-[rgb(var(--muted))] border border-[rgb(var(--border))] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary))] focus:border-transparent"
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isTyping}
                                        size="icon"
                                        className="rounded-full bg-[rgb(var(--primary))] hover:opacity-90"
                                    >
                                        {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all",
                    isOpen ? "bg-[rgb(var(--muted))]" : "bg-[rgb(var(--primary))] text-white"
                )}
            >
                {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </motion.button>
        </div>
    )
}
