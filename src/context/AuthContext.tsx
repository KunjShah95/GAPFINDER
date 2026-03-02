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
  logout: () => void
  updateProfile: (updates: { name?: string; avatar?: string }) => Promise<boolean>
  showAuthModal: boolean
  setShowAuthModal: (show: boolean) => void
  authModalMode: 'login' | 'register'
  setAuthModalMode: (mode: 'login' | 'register') => void
  loginWithGoogle: () => Promise<boolean>
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
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')

  const loadUser = useCallback(async () => {
    // Only try to load user if we have a token
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

  const logout = () => {
    authApi.logout()
    setUser(null)
  }

  const loginWithGoogle = async (): Promise<boolean> => {
    // Google OAuth would be wired through the backend
    // For now, show a message that it's coming soon
    console.warn('[Auth] Google login not yet integrated with backend')
    return false
  }

  const updateProfile = async (updates: { name?: string; avatar?: string }): Promise<boolean> => {
    try {
      await authApi.updateProfile(updates)
      // Refresh user data
      const profile = await authApi.getProfile()
      setUser(mapUserProfile(profile))
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
        logout,
        updateProfile,
        showAuthModal,
        setShowAuthModal,
        authModalMode,
        setAuthModalMode,
        loginWithGoogle,
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
