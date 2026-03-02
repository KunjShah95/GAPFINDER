import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultValue?: string
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
    ({ className, defaultValue, children, ...props }, ref) => {
        const [activeTab, setActiveTab] = React.useState(defaultValue || "")
        
        return (
            <div ref={ref} className={className} {...props}>
                {React.Children.map(children, (child) => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child as any, { 
                            activeTab, 
                            onTabChange: setActiveTab 
                        })
                    }
                    return child
                })}
            </div>
        )
    }
)
Tabs.displayName = "Tabs"

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
    activeTab?: string
    onTabChange?: (value: string) => void
}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
    ({ className, activeTab, onTabChange, children, ...props }, ref) => {
        return (
            <div ref={ref} className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props}>
                {React.Children.map(children, (child) => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child as any, { activeTab, onTabChange })
                    }
                    return child
                })}
            </div>
        )
    }
)
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    value: string
    activeTab?: string
    onTabChange?: (value: string) => void
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
    ({ className, value, activeTab, onTabChange, children, ...props }, ref) => {
        const isActive = activeTab === value
        
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                    className
                )}
                onClick={() => onTabChange?.(value)}
                {...props}
            >
                {children}
            </button>
        )
    }
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string
    activeTab?: string
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
    ({ className, value, activeTab, children, ...props }, ref) => {
        if (activeTab !== value) return null
        
        return (
            <div ref={ref} className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props}>
                {children}
            </div>
        )
    }
)
TabsContent.displayName = "TabsContent"
