import { Link, useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
    FileSearch,
    Menu,
    X,
    Sparkles,
    FolderOpen,
    LogIn,
    LogOut,
    Search,
    Lightbulb,
    LayoutDashboard,
    BrainCircuit,
    BookOpen,
    Users,
    FileSignature,
    Image,
    Bot,
    Trophy,
    Bell,
    User,
    ChevronRight,
    Zap
} from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useAuth } from "@/context/AuthContext"

// Navigation items with icons and descriptions
const mainNavItems = [
    { 
        name: "Dashboard", 
        path: "/dashboard", 
        icon: LayoutDashboard,
        description: "Overview & analytics"
    },
    { 
        name: "Crawl", 
        path: "/crawl", 
        icon: FileSearch,
        description: "Analyze papers"
    },
    { 
        name: "Explore", 
        path: "/explore", 
        icon: Search,
        description: "Discover gaps"
    },
    { 
        name: "Insights", 
        path: "/insights", 
        icon: Lightbulb,
        description: "AI-powered analysis"
    },
]

const aiToolsNav = [
    { 
        name: "Gap Prediction", 
        path: "/gap-prediction", 
        icon: BrainCircuit,
        description: "Predict future research gaps",
        badge: "AI"
    },
    { 
        name: "Literature Review", 
        path: "/literature-review-generator", 
        icon: BookOpen,
        description: "Generate comprehensive reviews",
        badge: "AI"
    },
    { 
        name: "Research Match", 
        path: "/research-matching", 
        icon: Users,
        description: "Find collaborators",
        badge: "AI"
    },
    { 
        name: "Grant Pipeline", 
        path: "/grant-pipeline", 
        icon: FileSignature,
        description: "Auto-draft proposals",
        badge: "AI"
    },
    { 
        name: "Multi-Modal", 
        path: "/multi-modal", 
        icon: Image,
        description: "Analyze figures & tables",
        badge: "AI"
    },
    { 
        name: "Agentic Research", 
        path: "/agentic-research", 
        icon: Bot,
        description: "Autonomous exploration",
        badge: "AI"
    },
]

const communityNav = [
    { 
        name: "Leaderboard", 
        path: "/leaderboard", 
        icon: Trophy,
        description: "Top researchers"
    },
    { 
        name: "Alerts", 
        path: "/alerts", 
        icon: Bell,
        description: "Stay updated"
    },
    { 
        name: "Collections", 
        path: "/collections", 
        icon: FolderOpen,
        description: "Organize papers"
    },
]

// Public navigation for landing page
const publicNavItems = [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "Community", href: "#community" },
    { name: "FAQ", href: "#faq" },
]

export function Navbar() {
    const location = useLocation()
    const navigate = useNavigate()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [aiToolsOpen, setAiToolsOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)
    const { isAuthenticated, user, logout, setShowAuthModal, setAuthModalMode } = useAuth()

    const isHomePage = location.pathname === "/"
    const showPublicNav = isHomePage && !isAuthenticated

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const handleSignIn = () => {
        setAuthModalMode("login")
        setShowAuthModal(true)
        setMobileMenuOpen(false)
    }

    const handleLogout = () => {
        logout()
        setMobileMenuOpen(false)
        navigate("/")
    }

    const isActive = (path: string) => location.pathname === path

    return (
        <>
            <motion.header
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                className={cn(
                    "fixed top-0 left-0 right-0 z-[var(--z-fixed)] transition-all duration-300",
                    scrolled 
                        ? "glass-strong shadow-lg" 
                        : "bg-transparent"
                )}
            >
                <div className="container-wide">
                    <nav className="flex items-center justify-between h-16 lg:h-20">
                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-2 group">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div className="absolute inset-0 rounded-xl gradient-primary opacity-0 group-hover:opacity-30 blur-xl transition-opacity" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xl font-bold tracking-tight">
                                    Gap<span className="gradient-text">Miner</span>
                                </span>
                                <span className="text-[10px] text-[rgb(var(--muted-foreground))] -mt-1 hidden sm:block">
                                    AI Research Discovery
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden lg:flex items-center gap-1">
                            {showPublicNav ? (
                                // Public navigation
                                <>
                                    {publicNavItems.map((item) => (
                                        <a
                                            key={item.name}
                                            href={item.href}
                                            className="px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] transition-colors"
                                        >
                                            {item.name}
                                        </a>
                                    ))}
                                </>
                            ) : isAuthenticated ? (
                                // Authenticated app navigation
                                <>
                                    {mainNavItems.map((item) => (
                                        <button
                                            key={item.name}
                                            onClick={() => navigate(item.path)}
                                            className={cn(
                                                "relative px-4 py-2 text-sm font-medium transition-all rounded-lg",
                                                isActive(item.path)
                                                    ? "text-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10"
                                                    : "text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]"
                                            )}
                                        >
                                            {item.name}
                                            {isActive(item.path) && (
                                                <motion.div
                                                    layoutId="activeNav"
                                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[rgb(var(--primary))]"
                                                />
                                            )}
                                        </button>
                                    ))}
                                    
                                    {/* AI Tools Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setAiToolsOpen(!aiToolsOpen)}
                                            onMouseEnter={() => setAiToolsOpen(true)}
                                            className={cn(
                                                "flex items-center gap-1 px-4 py-2 text-sm font-medium transition-all rounded-lg",
                                                aiToolsOpen || aiToolsNav.some(t => isActive(t.path))
                                                    ? "text-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10"
                                                    : "text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]"
                                            )}
                                        >
                                            <Zap className="w-4 h-4" />
                                            AI Tools
                                            <ChevronRight className={cn(
                                                "w-3 h-3 transition-transform",
                                                aiToolsOpen && "rotate-90"
                                            )} />
                                        </button>
                                        
                                        <AnimatePresence>
                                            {aiToolsOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    transition={{ duration: 0.2 }}
                                                    onMouseLeave={() => setAiToolsOpen(false)}
                                                    className="absolute top-full left-0 mt-2 w-72 glass-strong rounded-2xl shadow-2xl border border-[rgb(var(--border))] overflow-hidden"
                                                >
                                                    <div className="p-2">
                                                        <div className="px-3 py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">
                                                            AI-Powered Features
                                                        </div>
                                                        {aiToolsNav.map((item) => (
                                                            <button
                                                                key={item.name}
                                                                onClick={() => {
                                                                    navigate(item.path)
                                                                    setAiToolsOpen(false)
                                                                }}
                                                                className={cn(
                                                                    "w-full flex items-start gap-3 px-3 py-3 rounded-xl transition-all text-left",
                                                                    isActive(item.path)
                                                                        ? "bg-[rgb(var(--primary))]/10"
                                                                        : "hover:bg-[rgb(var(--muted))]"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "p-2 rounded-lg",
                                                                    isActive(item.path) 
                                                                        ? "bg-[rgb(var(--primary))]/20 text-[rgb(var(--primary))]"
                                                                        : "bg-[rgb(var(--muted))] text-[rgb(var(--foreground-muted))]"
                                                                )}>
                                                                    <item.icon className="w-4 h-4" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={cn(
                                                                            "font-medium",
                                                                            isActive(item.path) && "text-[rgb(var(--primary))]"
                                                                        )}>
                                                                            {item.name}
                                                                        </span>
                                                                        {item.badge && (
                                                                            <span className="badge badge-primary text-[10px] py-0.5 px-1.5">
                                                                                {item.badge}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-[rgb(var(--muted-foreground))] mt-0.5">
                                                                        {item.description}
                                                                    </p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    
                                    {communityNav.map((item) => (
                                        <button
                                            key={item.name}
                                            onClick={() => navigate(item.path)}
                                            className={cn(
                                                "relative px-4 py-2 text-sm font-medium transition-all rounded-lg",
                                                isActive(item.path)
                                                    ? "text-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10"
                                                    : "text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]"
                                            )}
                                        >
                                            {item.name}
                                        </button>
                                    ))}
                                </>
                            ) : null}
                        </div>

                        {/* Right Side Actions */}
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            
                            {!isAuthenticated ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleSignIn}
                                        className="hidden sm:flex"
                                    >
                                        <LogIn className="w-4 h-4 mr-2" />
                                        Sign In
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            setAuthModalMode("register")
                                            setShowAuthModal(true)
                                        }}
                                        className="btn btn-primary"
                                    >
                                        Get Started
                                    </Button>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => navigate("/settings")}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[rgb(var(--muted))] transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--accent))] flex items-center justify-center text-white font-medium text-sm">
                                            {user?.name?.charAt(0).toUpperCase() || "U"}
                                        </div>
                                        <span className="hidden md:block text-sm font-medium">
                                            {user?.name}
                                        </span>
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleLogout}
                                        className="hidden sm:flex"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                            
                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="lg:hidden p-2 rounded-lg hover:bg-[rgb(var(--muted))] transition-colors"
                            >
                                {mobileMenuOpen ? (
                                    <X className="w-6 h-6" />
                                ) : (
                                    <Menu className="w-6 h-6" />
                                )}
                            </button>
                        </div>
                    </nav>
                </div>
            </motion.header>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: "100%" }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-[var(--z-modal)] lg:hidden"
                    >
                        <div 
                            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        <motion.div
                            className="absolute right-0 top-0 bottom-0 w-[80%] max-w-sm glass-strong shadow-2xl"
                        >
                            <div className="flex flex-col h-full p-6">
                                <div className="flex items-center justify-between mb-8">
                                    <span className="text-xl font-bold">
                                        Gap<span className="gradient-text">Miner</span>
                                    </span>
                                    <button
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="p-2 rounded-lg hover:bg-[rgb(var(--muted))]"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                                
                                <div className="flex-1 overflow-auto space-y-6">
                                    {isAuthenticated ? (
                                        <>
                                            <div className="space-y-1">
                                                <div className="px-3 py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">
                                                    Main
                                                </div>
                                                {mainNavItems.map((item) => (
                                                    <button
                                                        key={item.name}
                                                        onClick={() => {
                                                            navigate(item.path)
                                                            setMobileMenuOpen(false)
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left",
                                                            isActive(item.path)
                                                                ? "bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]"
                                                                : "hover:bg-[rgb(var(--muted))]"
                                                        )}
                                                    >
                                                        <item.icon className="w-5 h-5" />
                                                        <span className="font-medium">{item.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <div className="px-3 py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">
                                                    AI Tools
                                                </div>
                                                {aiToolsNav.map((item) => (
                                                    <button
                                                        key={item.name}
                                                        onClick={() => {
                                                            navigate(item.path)
                                                            setMobileMenuOpen(false)
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left",
                                                            isActive(item.path)
                                                                ? "bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]"
                                                                : "hover:bg-[rgb(var(--muted))]"
                                                        )}
                                                    >
                                                        <item.icon className="w-5 h-5" />
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium">{item.name}</span>
                                                                {item.badge && (
                                                                    <span className="badge badge-primary text-[10px]">
                                                                        {item.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <div className="px-3 py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">
                                                    Community
                                                </div>
                                                {communityNav.map((item) => (
                                                    <button
                                                        key={item.name}
                                                        onClick={() => {
                                                            navigate(item.path)
                                                            setMobileMenuOpen(false)
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left",
                                                            isActive(item.path)
                                                                ? "bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]"
                                                                : "hover:bg-[rgb(var(--muted))]"
                                                        )}
                                                    >
                                                        <item.icon className="w-5 h-5" />
                                                        <span className="font-medium">{item.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-1">
                                            {publicNavItems.map((item) => (
                                                <a
                                                    key={item.name}
                                                    href={item.href}
                                                    onClick={() => setMobileMenuOpen(false)}
                                                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[rgb(var(--muted))] transition-colors"
                                                >
                                                    <span className="font-medium">{item.name}</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="pt-6 border-t border-[rgb(var(--border))]">
                                    {!isAuthenticated ? (
                                        <div className="space-y-2">
                                            <Button
                                                className="w-full btn-primary"
                                                onClick={() => {
                                                    setAuthModalMode("register")
                                                    setShowAuthModal(true)
                                                    setMobileMenuOpen(false)
                                                }}
                                            >
                                                Get Started
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="w-full"
                                                onClick={handleSignIn}
                                            >
                                                Sign In
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            className="w-full"
                                            onClick={handleLogout}
                                        >
                                            <LogOut className="w-4 h-4 mr-2" />
                                            Sign Out
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
