import { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import { authApi, getAccessToken, type UserProfile } from "@/lib/api-client"

interface User {
  id: string
  email: string
  name: string
  role: string
  tier: string
  avatar?: string
  isVerified?: boolean
  xp?: {
    totalXp: number
    level: number
    currentStreak: number
    papersAnalyzed: number
    gapsFound: number
  }
  createdAt?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (name: string, email: string, password: string) => Promise<boolean>
  loginWithGoogle: (credential: string) => Promise<boolean>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  updateProfile: (updates: { name?: string; avatar?: string }) => Promise<boolean>
  forgotPassword: (email: string) => Promise<boolean>
  resetPassword: (token: string, newPassword: string) => Promise<boolean>
  sendVerification: () => Promise<boolean>
  showAuthModal: boolean
  setShowAuthModal: (show: boolean) => void
  authModalMode: 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email'
  setAuthModalMode: (mode: 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email') => void
  resetToken: string | null
  setResetToken: (token: string | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function mapUserProfile(profile: UserProfile): User {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    tier: profile.tier,
    avatar: profile.avatar,
    xp: profile.xp,
    createdAt: profile.createdAt,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email'>('login')
  const [resetToken, setResetToken] = useState<string | null>(null)

  const loadUser = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const profile = await authApi.getProfile()
      setUser(mapUserProfile(profile))
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const profile = await authApi.login(email, password)
      setUser(mapUserProfile(profile))
      setShowAuthModal(false)
      return true
    } catch (error) {
      console.error('[Auth] Login failed:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const profile = await authApi.register(email, password, name)
      setUser(mapUserProfile(profile))
      setShowAuthModal(false)
      return true
    } catch (error) {
      console.error('[Auth] Register failed:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const loginWithGoogle = async (credential: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const response = await authApi.loginWithGoogle(credential)
      setUser(mapUserProfile(response.user))
      setShowAuthModal(false)
      return true
    } catch (error) {
      console.error('[Auth] Google login failed:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      authApi.clearTokens()
      setUser(null)
    }
  }

  const logoutAll = async () => {
    try {
      await authApi.logoutAll()
    } finally {
      authApi.clearTokens()
      setUser(null)
    }
  }

  const updateProfile = async (updates: { name?: string; avatar?: string }): Promise<boolean> => {
    try {
      await authApi.updateProfile(updates)
      const profile = await authApi.getProfile()
      setUser(mapUserProfile(profile))
      return true
    } catch {
      return false
    }
  }

  const forgotPassword = async (email: string): Promise<boolean> => {
    try {
      await authApi.forgotPassword(email)
      return true
    } catch {
      return false
    }
  }

  const resetPassword = async (token: string, newPassword: string): Promise<boolean> => {
    try {
      await authApi.resetPassword(token, newPassword)
      return true
    } catch {
      return false
    }
  }

  const sendVerification = async (): Promise<boolean> => {
    try {
      await authApi.sendVerification()
      return true
    } catch {
      return false
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        logoutAll,
        updateProfile,
        forgotPassword,
        resetPassword,
        sendVerification,
        showAuthModal,
        setShowAuthModal,
        authModalMode,
        setAuthModalMode,
        resetToken,
        setResetToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
