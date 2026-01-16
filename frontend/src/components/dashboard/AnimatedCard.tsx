import { motion } from 'framer-motion';
import { Card } from '../ui/card';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  index?: number;
}

export function AnimatedCard({ children, className, delay = 0, index = 0 }: AnimatedCardProps) {
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
      layout
    >
      <Card className={className}>
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
}

export function MetricValue({ value, className }: MetricValueProps) {
  return (
    <motion.span
      className={className}
      key={value}
      initial={{ scale: 1.2, color: '#10b981' }}
      animate={{ scale: 1, color: 'inherit' }}
      transition={{ duration: 0.3 }}
    >
      {value}
    </motion.span>
  );
}
