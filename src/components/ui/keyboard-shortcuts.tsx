// Keyboard Shortcuts System
// Power user features with global keyboard shortcut handling

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Command,
    Search,
    FileSearch,
    Lightbulb,
    Settings,
    Users,
    BarChart3,
    Keyboard,
    X,
} from "lucide-react"

// Shortcut definitions
export interface KeyboardShortcut {
    key: string
    modifiers: ("ctrl" | "shift" | "alt" | "meta")[]
    action: string
    description: string
    handler: () => void
}

// Hook to register shortcuts
export function useKeyboardShortcut(
    key: string,
    modifiers: ("ctrl" | "shift" | "alt" | "meta")[],
    handler: () => void,
    _description: string = ""
) {
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const modifiersMatch =
                modifiers.includes("ctrl") === e.ctrlKey &&
                modifiers.includes("shift") === e.shiftKey &&
                modifiers.includes("alt") === e.altKey &&
                modifiers.includes("meta") === e.metaKey

            if (e.key.toLowerCase() === key.toLowerCase() && modifiersMatch) {
                e.preventDefault()
                handler()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [key, modifiers, handler])
}

// Hook for Command Palette
export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false)

    // Cmd/Ctrl + K to open
    useKeyboardShortcut("k", ["ctrl"], () => setIsOpen(true), "Open command palette")

    // Escape to close
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false)
            }
        }
        window.addEventListener("keydown", handleEscape)
        return () => window.removeEventListener("keydown", handleEscape)
    }, [isOpen])

    return { isOpen, setIsOpen }
}

// Command Palette component
interface CommandItem {
    id: string
    icon: typeof Search
    label: string
    shortcut?: string
    action: () => void
    category: string
}

export function CommandPalette({
    isOpen,
    onClose,
    onNavigate,
}: {
    isOpen: boolean
    onClose: () => void
    onNavigate: (path: string) => void
}) {
    const [query, setQuery] = useState("")
    const [selectedIndex, setSelectedIndex] = useState(0)

    const commands: CommandItem[] = [
        {
            id: "search",
            icon: Search,
            label: "Search papers",
            shortcut: "/",
            action: () => onNavigate("/explore"),
            category: "Navigation",
        },
        {
            id: "crawl",
            icon: FileSearch,
            label: "Analyze new paper",
            shortcut: "Ctrl+N",
            action: () => onNavigate("/crawl"),
            category: "Navigation",
        },
        {
            id: "gaps",
            icon: Lightbulb,
            label: "View gaps",
            shortcut: "G",
            action: () => onNavigate("/insights"),
            category: "Navigation",
        },
        {
            id: "dashboard",
            icon: BarChart3,
            label: "Dashboard",
            shortcut: "D",
            action: () => onNavigate("/dashboard"),
            category: "Navigation",
        },
        {
            id: "team",
            icon: Users,
            label: "Team settings",
            shortcut: "T",
            action: () => onNavigate("/team"),
            category: "Settings",
        },
        {
            id: "settings",
            icon: Settings,
            label: "Settings",
            shortcut: "Ctrl+,",
            action: () => console.log("Open settings"),
            category: "Settings",
        },
        {
            id: "shortcuts",
            icon: Keyboard,
            label: "Keyboard shortcuts",
            shortcut: "?",
            action: () => console.log("Show shortcuts"),
            category: "Help",
        },
    ]

    // Filter commands
    const filteredCommands = commands.filter(cmd =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.category.toLowerCase().includes(query.toLowerCase())
    )

    // Group by category
    const groupedCommands = filteredCommands.reduce((acc, cmd) => {
        if (!acc[cmd.category]) acc[cmd.category] = []
        acc[cmd.category].push(cmd)
        return acc
    }, {} as Record<string, CommandItem[]>)

    // Keyboard navigation
    useEffect(() => {
        function handleNav(e: KeyboardEvent) {
            if (!isOpen) return

            if (e.key === "ArrowDown") {
                e.preventDefault()
                setSelectedIndex(prev =>
                    prev < filteredCommands.length - 1 ? prev + 1 : 0
                )
            } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredCommands.length - 1
                )
            } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
                e.preventDefault()
                filteredCommands[selectedIndex].action()
                onClose()
            }
        }

        window.addEventListener("keydown", handleNav)
        return () => window.removeEventListener("keydown", handleNav)
    }, [isOpen, filteredCommands, selectedIndex, onClose])

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setQuery("")
            setSelectedIndex(0)
        }
    }, [isOpen])

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="relative z-10 w-full max-w-xl mx-4 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] shadow-2xl overflow-hidden"
                    >
                        {/* Search input */}
                        <div className="flex items-center gap-3 p-4 border-b border-[hsl(var(--border))]">
                            <Command className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                            <input
                                type="text"
                                placeholder="Type a command or search..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-lg placeholder:text-[hsl(var(--muted-foreground))]"
                                autoFocus
                            />
                            <kbd className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))]">
                                ESC
                            </kbd>
                        </div>

                        {/* Results */}
                        <div className="max-h-[50vh] overflow-y-auto p-2">
                            {Object.entries(groupedCommands).map(([category, items]) => (
                                <div key={category} className="mb-4">
                                    <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] px-2 mb-2">
                                        {category}
                                    </p>
                                    {items.map((cmd) => {
                                        const flatIndex = filteredCommands.indexOf(cmd)
                                        const Icon = cmd.icon
                                        return (
                                            <button
                                                key={cmd.id}
                                                onClick={() => {
                                                    cmd.action()
                                                    onClose()
                                                }}
                                                onMouseEnter={() => setSelectedIndex(flatIndex)}
                                                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${selectedIndex === flatIndex
                                                    ? "bg-[hsl(var(--brand-primary))]/10 text-[hsl(var(--brand-primary))]"
                                                    : "hover:bg-[hsl(var(--muted))]/50"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon className="h-4 w-4" />
                                                    <span className="text-sm">{cmd.label}</span>
                                                </div>
                                                {cmd.shortcut && (
                                                    <kbd className="px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))]">
                                                        {cmd.shortcut}
                                                    </kbd>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}

                            {filteredCommands.length === 0 && (
                                <p className="text-center text-[hsl(var(--muted-foreground))] py-8">
                                    No commands found
                                </p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-[hsl(var(--border))] flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-[hsl(var(--muted))]">↑↓</kbd>
                                    Navigate
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-[hsl(var(--muted))]">⏎</kbd>
                                    Select
                                </span>
                            </div>
                            <span className="flex items-center gap-1">
                                <Keyboard className="h-3 w-3" />
                                Press ? for all shortcuts
                            </span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

// Keyboard shortcuts help modal
export function KeyboardShortcutsHelp({
    isOpen,
    onClose
}: {
    isOpen: boolean
    onClose: () => void
}) {
    const shortcuts = [
        {
            category: "Navigation", items: [
                { keys: ["Ctrl", "K"], description: "Open command palette" },
                { keys: ["G", "D"], description: "Go to dashboard" },
                { keys: ["G", "C"], description: "Go to crawl" },
                { keys: ["G", "E"], description: "Go to explore" },
                { keys: ["G", "I"], description: "Go to insights" },
            ]
        },
        {
            category: "Actions", items: [
                { keys: ["Ctrl", "N"], description: "Analyze new paper" },
                { keys: ["Ctrl", "S"], description: "Save current work" },
                { keys: ["Ctrl", "F"], description: "Search" },
            ]
        },
        {
            category: "View", items: [
                { keys: ["?"], description: "Show keyboard shortcuts" },
                { keys: ["Esc"], description: "Close modal / Cancel" },
            ]
        },
    ]

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative z-10 w-full max-w-lg mx-4 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] shadow-2xl"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
                            <div className="flex items-center gap-2">
                                <Keyboard className="h-5 w-5 text-[hsl(var(--brand-primary))]" />
                                <h2 className="font-bold">Keyboard Shortcuts</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-[hsl(var(--muted))] transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {shortcuts.map(section => (
                                <div key={section.category} className="mb-6 last:mb-0">
                                    <h3 className="text-sm font-medium text-[hsl(var(--muted-foreground))] mb-3">
                                        {section.category}
                                    </h3>
                                    <div className="space-y-2">
                                        {section.items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between py-2"
                                            >
                                                <span className="text-sm">{item.description}</span>
                                                <div className="flex items-center gap-1">
                                                    {item.keys.map((key, i) => (
                                                        <kbd
                                                            key={i}
                                                            className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-xs font-mono"
                                                        >
                                                            {key}
                                                        </kbd>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
