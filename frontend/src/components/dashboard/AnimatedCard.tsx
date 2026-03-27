import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/card';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  index?: number;
  glowColor?: string;
}

export function AnimatedCard({ children, className, delay = 0, index = 0, glowColor }: AnimatedCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{
        duration: 0.3,
        delay: delay + (index * 0.05),
        ease: [0.4, 0, 0.2, 1]
      }}
      whileHover={{ y: -2 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      layout
      className="relative"
    >
      {/* Glow effect on hover */}
      {glowColor && (
        <motion.div
          className="absolute -inset-0.5 rounded-xl blur-sm opacity-0 pointer-events-none"
          style={{ background: glowColor }}
          animate={{ opacity: isHovered ? 0.15 : 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
      <Card className={`relative ${className}`}>
        {children}
      </Card>
    </motion.div>
  );
}

interface PulseIndicatorProps {
  className?: string;
  color?: 'emerald' | 'amber' | 'orange' | 'red';
}

export function PulseIndicator({ className, color = 'emerald' }: PulseIndicatorProps) {
  const colors = {
    emerald: 'bg-emerald-500 shadow-emerald-500/50',
    amber: 'bg-amber-500 shadow-amber-500/50',
    orange: 'bg-orange-500 shadow-orange-500/50',
    red: 'bg-red-500 shadow-red-500/50',
  };

  return (
    <div className={`relative ${className}`}>
      <div className={`w-3 h-3 rounded-full ${colors[color]}`} />
      <motion.div
        className={`absolute inset-0 w-3 h-3 rounded-full ${colors[color]}`}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [1, 0.5, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
    </div>
  );
}

interface GlowingTextProps {
  children: React.ReactNode;
  className?: string;
}

export function GlowingText({ children, className }: GlowingTextProps) {
  return (
    <motion.span
      className={className}
      animate={{
        textShadow: [
          '0 0 18px rgba(251, 191, 36, 0.4)',
          '0 0 28px rgba(251, 191, 36, 0.7)',
          '0 0 18px rgba(251, 191, 36, 0.4)',
        ],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.span>
  );
}

interface MetricValueProps {
  value: number;
  className?: string;
  duration?: number;
}

export function MetricValue({ value, className, duration = 0.8 }: MetricValueProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  // Animated counting effect
  useEffect(() => {
    const startValue = prevValue.current;
    const endValue = value;
    const startTime = Date.now();
    const durationMs = duration * 1000;

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / durationMs, 1);

      // Easing function (ease out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * eased);

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  const isIncreasing = value > prevValue.current;

  return (
    <motion.span
      className={className}
      key={value}
      initial={{ scale: 1.1 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        color: isIncreasing ? '#10b981' : undefined,
      }}
    >
      {displayValue}
    </motion.span>
  );
}

// Staggered container for lists
interface StaggeredContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggeredContainer({ children, className, staggerDelay = 0.05 }: StaggeredContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// Staggered item for use inside StaggeredContainer
interface StaggeredItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggeredItem({ children, className }: StaggeredItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Shimmer loading placeholder
interface ShimmerProps {
  className?: string;
}

export function Shimmer({ className }: ShimmerProps) {
  return (
    <div className={`relative overflow-hidden bg-stone-800 rounded ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-stone-700/50 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
