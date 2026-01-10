import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
      };
    case 'down':
      return {
        icon: TrendingDown,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
      };
    case 'neutral':
    default:
      return {
        icon: Minus,
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
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
  colorClass = 'text-cyan-400',
}: MetricsCardProps) {
  const trendConfig = trend ? getTrendConfig(trend) : null;
  const TrendIcon = trendConfig?.icon;

  return (
    <Card className="bg-slate-800/50 border-slate-700 p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-100">{value}</span>
            {trend && trendConfig && TrendIcon && (
              <div className={`flex items-center gap-1 ${trendConfig.color} text-sm`}>
                <TrendIcon className="w-4 h-4" />
                {trendValue && <span>{trendValue}</span>}
              </div>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
}
