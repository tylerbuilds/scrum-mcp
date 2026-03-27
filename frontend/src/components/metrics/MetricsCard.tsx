import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '../ui/card';

export interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  colorClass?: string;
}

function getTrendConfig(trend: 'up' | 'down' | 'neutral') {
  switch (trend) {
    case 'up':
      return {
        icon: TrendingUp,
        color: 'text-lime-400',
        bgColor: 'bg-lime-500/10',
      };
    case 'down':
      return {
        icon: TrendingDown,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
      };
    case 'neutral':
    default:
      return {
        icon: Minus,
        color: 'text-stone-400',
        bgColor: 'bg-stone-500/10',
      };
  }
}

export function MetricsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  colorClass = 'text-amber-400',
}: MetricsCardProps) {
  const trendConfig = trend ? getTrendConfig(trend) : null;
  const TrendIcon = trendConfig?.icon;

  return (
    <Card className="bg-stone-950/70 border-stone-800 p-4 hover:border-stone-700 transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-stone-400 mb-2">
            <div className={`p-1.5 rounded-md ${colorClass.replace('text-', 'bg-').replace('-400', '-500/15')}`}>
              <Icon className={`w-4 h-4 ${colorClass}`} />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <motion.span
              key={String(value)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-bold text-stone-100"
            >
              {value}
            </motion.span>
            {trend && trendConfig && TrendIcon && (
              <div className={`flex items-center gap-1 ${trendConfig.color} text-xs px-1.5 py-0.5 rounded ${trendConfig.bgColor}`}>
                <TrendIcon className="w-3 h-3" />
                {trendValue && <span className="font-medium">{trendValue}</span>}
              </div>
            )}
          </div>
          {subtitle && <p className="text-xs text-stone-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
}
