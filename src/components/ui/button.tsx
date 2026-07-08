import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[0.01em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden cursor-pointer select-none",
    {
        variants: {
            variant: {
                default:
                    "bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] shadow-[0_4px_20px_rgb(var(--primary)/0.4),0_0_40px_rgb(var(--primary)/0.15)] hover:shadow-[0_8px_30px_rgb(var(--primary)/0.5),0_0_60px_rgb(var(--primary)/0.25)] active:scale-[0.95] animate-glow-pulse",
                destructive:
                    "bg-[rgb(var(--destructive))] text-[rgb(var(--destructive-foreground))] shadow-[0_4px_20px_rgb(var(--destructive)/0.4),0_0_30px_rgb(var(--destructive)/0.1)] hover:shadow-[0_8px_30px_rgb(var(--destructive)/0.5),0_0_50px_rgb(var(--destructive)/0.2)] animate-glow-pulse",
                outline:
                    "border-2 border-[rgb(var(--primary)/0.3)] bg-transparent text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)/0.05)] hover:border-[rgb(var(--primary))] hover:shadow-[0_0_20px_rgb(var(--primary)/0.3)]",
                secondary:
                    "bg-[rgb(var(--secondary))] text-[rgb(var(--secondary-foreground))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--muted))] hover:border-[rgb(var(--primary)/0.3)] hover:shadow-[0_0_15px_rgb(var(--primary)/0.15)]",
                ghost:
                    "hover:bg-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))] hover:shadow-[0_0_12px_rgb(var(--primary)/0.08)]",
                link: "text-[rgb(var(--primary))] underline-offset-4 hover:underline hover:opacity-80",
                gradient:
                    "bg-gradient-to-r from-[rgb(var(--primary))] via-[rgb(var(--accent))] to-[rgb(var(--primary-dark))] bg-[length:200%_200%] text-white shadow-[0_4px_20px_rgb(var(--primary)/0.4),0_0_40px_rgb(var(--accent)/0.15)] hover:shadow-[0_8px_30px_rgb(var(--primary)/0.5),0_0_60px_rgb(var(--accent)/0.25)] animate-gradient-shift animate-glow-pulse",
            },
            size: {
                default: "h-11 px-6 py-2",
                sm: "h-9 rounded-full px-4 text-xs",
                lg: "h-12 px-8 text-base",
                xl: "h-14 px-10 text-lg",
                icon: "h-11 w-11 rounded-full",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, children, ...props }, ref) => {
        const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([])
        const buttonRef = React.useRef<HTMLButtonElement>(null)
        const mergedRef = useMergedRef(ref, buttonRef)

        const x = useMotionValue(0)
        const y = useMotionValue(0)

        const springConfig = { stiffness: 300, damping: 20 }
        const springX = useSpring(x, springConfig)
        const springY = useSpring(y, springConfig)

        const rotateX = useTransform(springY, [-0.5, 0.5], ["4deg", "-4deg"])
        const rotateY = useTransform(springX, [-0.5, 0.5], ["-4deg", "4deg"])

        const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (!buttonRef.current) return
            const rect = buttonRef.current.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            const normalX = (e.clientX - centerX) / (rect.width / 2)
            const normalY = (e.clientY - centerY) / (rect.height / 2)
            x.set(normalX * 0.3)
            y.set(normalY * 0.3)
        }

        const handleMouseLeave = () => {
            x.set(0)
            y.set(0)
        }

        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (!buttonRef.current) return
            const rect = buttonRef.current.getBoundingClientRect()
            const newRipple = {
                id: Date.now(),
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            }
            setRipples(prev => [...prev, newRipple])
            setTimeout(() => {
                setRipples(prev => prev.filter(r => r.id !== newRipple.id))
            }, 600)
            props.onClick?.(e)
        }

        return (
            <motion.button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={mergedRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                style={{
                    rotateX: variant !== "link" ? rotateX : undefined,
                    rotateY: variant !== "link" ? rotateY : undefined,
                    perspective: 600,
                }}
                {...(props as any)}
            >
                {ripples.map(ripple => (
                    <span
                        key={ripple.id}
                        className="absolute rounded-full bg-white/30 pointer-events-none animate-ripple"
                        style={{
                            left: ripple.x,
                            top: ripple.y,
                            width: 0,
                            height: 0,
                        }}
                    />
                ))}
                <span className="relative z-10 flex items-center gap-2">{children}</span>
            </motion.button>
        )
    }
)
Button.displayName = "Button"

function useMergedRef<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
    return React.useCallback((value: T) => {
        refs.forEach(ref => {
            if (typeof ref === "function") ref(value)
            else if (ref) (ref as React.MutableRefObject<T | null>).current = value
        })
    }, refs)
}

export { Button, buttonVariants }
