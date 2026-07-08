import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Sparkles, Loader2, Mail, Lock, User, CheckCircle2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: any) => void
                    renderButton: (element: HTMLElement, config: any) => void
                    prompt: () => void
                }
            }
        }
    }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""

export function AuthModal() {
    const {
        showAuthModal,
        setShowAuthModal,
        authModalMode,
        setAuthModalMode,
        loginWithGoogle,
        login,
        register,
        forgotPassword,
        resetPassword,
        resetToken,
        setResetToken,
    } = useAuth()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const googleButtonRef = useRef<HTMLDivElement>(null)

    // Initialize Google Identity Services
    useEffect(() => {
        if (!showAuthModal || !GOOGLE_CLIENT_ID) return

        const script = document.createElement("script")
        script.src = "https://accounts.google.com/gsi/client"
        script.async = true
        script.defer = true
        document.head.appendChild(script)

        script.onload = () => {
            if (window.google?.accounts?.id && googleButtonRef.current) {
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleCredentialResponse,
                    auto_select: false,
                })

                window.google.accounts.id.renderButton(googleButtonRef.current, {
                    theme: "outline",
                    size: "large",
                    width: "100%",
                    text: "continue_with",
                    shape: "rectangular",
                })
            }
        }

        return () => {
            document.head.removeChild(script)
        }
    }, [showAuthModal])

    const handleGoogleCredentialResponse = async (response: { credential: string }) => {
        setError("")
        setIsLoading(true)
        try {
            const success = await loginWithGoogle(response.credential)
            if (success) {
                setShowAuthModal(false)
                resetForm()
            } else {
                setError("Google sign-in failed. Please try again.")
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed")
        } finally {
            setIsLoading(false)
        }
    }

    const resetForm = () => {
        setEmail("")
        setPassword("")
        setName("")
        setNewPassword("")
        setError("")
        setSuccess("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setSuccess("")
        setIsLoading(true)

        try {
            let success = false
            if (authModalMode === "login") {
                success = await login(email, password)
            } else if (authModalMode === "register") {
                success = await register(name, email, password)
            } else if (authModalMode === "forgot-password") {
                success = await forgotPassword(email)
                if (success) {
                    setSuccess("If an account exists with that email, a reset link has been sent.")
                }
            } else if (authModalMode === "reset-password") {
                if (!resetToken) {
                    setError("Invalid reset token")
                    return
                }
                success = await resetPassword(resetToken, newPassword)
                if (success) {
                    setSuccess("Password reset successfully! You can now sign in.")
                    setTimeout(() => {
                        setAuthModalMode("login")
                        setResetToken(null)
                    }, 2000)
                }
            }

            if (success && authModalMode !== "forgot-password" && authModalMode !== "reset-password") {
                setShowAuthModal(false)
                resetForm()
            } else if (!success && authModalMode !== "forgot-password") {
                setError("Invalid credentials. Please try again.")
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const handleClose = () => {
        setShowAuthModal(false)
        setAuthModalMode("login")
        setResetToken(null)
        resetForm()
    }

    const getTitle = () => {
        switch (authModalMode) {
            case "login": return "Welcome Back"
            case "register": return "Create Account"
            case "forgot-password": return "Reset Password"
            case "reset-password": return "New Password"
            case "verify-email": return "Verify Email"
            default: return "Welcome Back"
        }
    }

    const getSubtitle = () => {
        switch (authModalMode) {
            case "login": return "Sign in to access your research insights"
            case "register": return "Join GapMiner to start discovering research gaps"
            case "forgot-password": return "Enter your email to receive a reset link"
            case "reset-password": return "Enter your new password"
            case "verify-email": return "Check your email for a verification link"
            default: return "Sign in to access your research insights"
        }
    }

    const showGoogleButton = authModalMode === "login" || authModalMode === "register"
    const showEmailForm = authModalMode !== "verify-email"

    return (
        <AnimatePresence>
            {showAuthModal && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed z-101 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md"
                    >
                        <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="relative h-24 bg-linear-to-br from-[hsl(var(--brand-primary))] to-[hsl(var(--brand-secondary))] flex items-center justify-center">
                                <div className="absolute inset-0 dot-pattern opacity-20" />
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.1, type: "spring" }}
                                    className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
                                >
                                    <Sparkles className="h-8 w-8 text-white" />
                                </motion.div>
                                <button
                                    onClick={handleClose}
                                    className="absolute top-4 right-4 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                    <X className="h-5 w-5 text-white" />
                                </button>
                            </div>

                            <div className="p-6 pt-8">
                                <motion.div
                                    key={authModalMode}
                                    initial={{ opacity: 0, x: authModalMode === "login" ? -20 : 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <h2 className="text-2xl font-bold text-center mb-2">
                                        {getTitle()}
                                    </h2>
                                    <p className="text-center text-[hsl(var(--muted-foreground))] mb-6">
                                        {getSubtitle()}
                                    </p>

                                    {showEmailForm && (
                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            {authModalMode === "register" && (
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium">Full Name</label>
                                                    <div className="relative">
                                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <input
                                                            type="text"
                                                            placeholder="John Doe"
                                                            value={name}
                                                            onChange={(e) => setName(e.target.value)}
                                                            className="flex h-10 w-full rounded-full border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background"
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {authModalMode !== "reset-password" && (
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium">Email</label>
                                                    <div className="relative">
                                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <input
                                                            type="email"
                                                            placeholder="you@example.com"
                                                            value={email}
                                                            onChange={(e) => setEmail(e.target.value)}
                                                            className="flex h-10 w-full rounded-full border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background"
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {authModalMode !== "forgot-password" && (
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium">
                                                        {authModalMode === "reset-password" ? "New Password" : "Password"}
                                                    </label>
                                                    <div className="relative">
                                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <input
                                                            type="password"
                                                            placeholder="••••••••"
                                                            value={authModalMode === "reset-password" ? newPassword : password}
                                                            onChange={(e) => authModalMode === "reset-password" ? setNewPassword(e.target.value) : setPassword(e.target.value)}
                                                            className="flex h-10 w-full rounded-full border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background"
                                                            required
                                                            minLength={8}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {authModalMode === "login" && (
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAuthModalMode("forgot-password")
                                                            setError("")
                                                            setSuccess("")
                                                        }}
                                                        className="text-sm text-primary hover:underline"
                                                    >
                                                        Forgot password?
                                                    </button>
                                                </div>
                                            )}

                                            {error && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500 text-center"
                                                >
                                                    {error}
                                                </motion.div>
                                            )}

                                            {success && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-500 text-center flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    {success}
                                                </motion.div>
                                            )}

                                            <Button
                                                type="submit"
                                                variant="default"
                                                className="w-full"
                                                size="lg"
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                        {authModalMode === "login" ? "Signing in..." :
                                                         authModalMode === "register" ? "Creating account..." :
                                                         authModalMode === "forgot-password" ? "Sending..." :
                                                         "Resetting..."}
                                                    </>
                                                ) : (
                                                    authModalMode === "login" ? "Sign in" :
                                                    authModalMode === "register" ? "Create account" :
                                                    authModalMode === "forgot-password" ? "Send reset link" :
                                                    "Reset password"
                                                )}
                                            </Button>
                                        </form>
                                    )}

                                    {authModalMode === "verify-email" && (
                                        <div className="text-center space-y-4">
                                            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                                <Mail className="h-12 w-12 mx-auto text-blue-500 mb-3" />
                                                <p className="text-sm text-muted-foreground">
                                                    We've sent a verification link to your email address.
                                                    Please check your inbox and click the link to verify your account.
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                className="w-full"
                                                onClick={() => setAuthModalMode("login")}
                                            >
                                                Back to Sign In
                                            </Button>
                                        </div>
                                    )}

                                    {showGoogleButton && GOOGLE_CLIENT_ID && (
                                        <>
                                            <div className="relative my-6">
                                                <div className="absolute inset-0 flex items-center">
                                                    <div className="w-full border-t border-border" />
                                                </div>
                                                <div className="relative flex justify-center text-xs uppercase">
                                                    <span className="bg-[hsl(var(--card))] px-2 text-muted-foreground">
                                                        Or continue with
                                                    </span>
                                                </div>
                                            </div>

                                            <div ref={googleButtonRef} className="w-full" />
                                        </>
                                    )}

                                    {(authModalMode === "login" || authModalMode === "register") && (
                                        <p className="text-center text-sm text-muted-foreground mt-6">
                                            {authModalMode === "login" ? (
                                                <>
                                                    Don't have an account?{" "}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAuthModalMode("register")
                                                            setError("")
                                                            setSuccess("")
                                                        }}
                                                        className="text-primary hover:underline font-medium"
                                                    >
                                                        Sign up
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    Already have an account?{" "}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAuthModalMode("login")
                                                            setError("")
                                                            setSuccess("")
                                                        }}
                                                        className="text-primary hover:underline font-medium"
                                                    >
                                                        Sign in
                                                    </button>
                                                </>
                                            )}
                                        </p>
                                    )}

                                    {(authModalMode === "forgot-password" || authModalMode === "reset-password") && (
                                        <p className="text-center text-sm text-muted-foreground mt-6">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAuthModalMode("login")
                                                    setError("")
                                                    setSuccess("")
                                                }}
                                                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                                            >
                                                <ArrowLeft className="h-3 w-3" />
                                                Back to Sign In
                                            </button>
                                        </p>
                                    )}
                                </motion.div>
                            </div>

                            <div className="px-6 py-4 bg-[hsl(var(--muted))] border-t border-[hsl(var(--border))]">
                                <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
                                    Demo: demo@gapminer.com / demo123
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
