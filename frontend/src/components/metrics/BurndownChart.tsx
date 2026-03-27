import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, Target } from 'lucide-react';

interface BurndownChartProps {
  totalScope: number;
  completedByDay: number[];
  title?: string;
  showIdealLine?: boolean;
}

export function BurndownChart({
  totalScope,
  completedByDay,
  title = 'Sprint Burndown',
  showIdealLine = true,
}: BurndownChartProps) {
  const days = completedByDay.length;

  // Calculate remaining work by day
  const burndownData = useMemo(() => {
    let remaining = totalScope;
    return completedByDay.map((completed) => {
      remaining -= completed;
      return Math.max(0, remaining);
    });
  }, [totalScope, completedByDay]);

  // Calculate ideal burndown line
  const idealLine = useMemo(() => {
    const dailyBurn = totalScope / (days - 1 || 1);
    return Array.from({ length: days }, (_, i) => Math.max(0, totalScope - dailyBurn * i));
  }, [totalScope, days]);

  const maxValue = totalScope;
  const chartHeight = 160;
  const chartWidth = 100; // percentage

  // Generate path for actual burndown
  const actualPath = useMemo(() => {
    if (burndownData.length === 0) return '';
    const points = burndownData.map((value, idx) => {
      const x = (idx / (burndownData.length - 1 || 1)) * chartWidth;
      const y = chartHeight - (value / maxValue) * chartHeight;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }, [burndownData, maxValue]);

  // Generate path for ideal line
  const idealPath = useMemo(() => {
    if (idealLine.length === 0) return '';
    const points = idealLine.map((value, idx) => {
      const x = (idx / (idealLine.length - 1 || 1)) * chartWidth;
      const y = chartHeight - (value / maxValue) * chartHeight;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }, [idealLine, maxValue]);

  const currentRemaining = burndownData[burndownData.length - 1] || 0;
  const idealRemaining = idealLine[burndownData.length - 1] || 0;
  const variance = currentRemaining - idealRemaining;
  const isAhead = variance < 0;
  const isBehind = variance > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-stone-300 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-amber-400" />
          {title}
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-stone-400">Actual</span>
          </div>
          {showIdealLine && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-stone-500" />
              <span className="text-xs text-stone-500">Ideal</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="relative h-40 bg-stone-900/50 rounded-lg border border-stone-800 p-4">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <line
              key={pct}
              x1="0"
              y1={chartHeight - (pct / 100) * chartHeight}
              x2={chartWidth}
              y2={chartHeight - (pct / 100) * chartHeight}
              stroke="rgb(68 64 60)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          ))}

          {/* Ideal line */}
          {showIdealLine && (
            <motion.path
              d={idealPath}
              fill="none"
              stroke="rgb(120 113 108)"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          )}

          {/* Actual burndown line */}
          <motion.path
            d={actualPath}
            fill="none"
            stroke="rgb(245 158 11)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          />

          {/* Area fill under actual line */}
          <motion.path
            d={`${actualPath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`}
            fill="url(#burndownGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="burndownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(245 158 11)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Current point marker */}
          <motion.circle
            cx={(burndownData.length - 1) / (burndownData.length - 1 || 1) * chartWidth}
            cy={chartHeight - (currentRemaining / maxValue) * chartHeight}
            r="3"
            fill="rgb(245 158 11)"
            stroke="rgb(28 25 23)"
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 1.2 }}
          />
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between text-[10px] text-stone-500 -ml-1">
          <span>{totalScope}</span>
          <span>{Math.round(totalScope / 2)}</span>
          <span>0</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-stone-500 text-xs">Remaining</span>
            <p className="text-stone-100 font-semibold">{currentRemaining} tasks</p>
          </div>
          <div>
            <span className="text-stone-500 text-xs">Completed</span>
            <p className="text-lime-400 font-semibold">
              {totalScope - currentRemaining} tasks
            </p>
          </div>
        </div>

        {/* Variance indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
          isAhead ? 'bg-lime-500/10 border border-lime-500/30' :
          isBehind ? 'bg-orange-500/10 border border-orange-500/30' :
          'bg-stone-800 border border-stone-700'
        }`}>
          <Target className={`w-4 h-4 ${
            isAhead ? 'text-lime-400' :
            isBehind ? 'text-orange-400' :
            'text-stone-400'
          }`} />
          <span className={`text-xs font-medium ${
            isAhead ? 'text-lime-300' :
            isBehind ? 'text-orange-300' :
            'text-stone-300'
          }`}>
            {isAhead ? `${Math.abs(variance)} ahead` :
             isBehind ? `${variance} behind` :
             'On track'}
          </span>
        </div>
      </div>

      {/* Day labels */}
      <div className="flex justify-between text-[10px] text-stone-500 px-4">
        <span>Day 1</span>
        <span>Day {Math.ceil(days / 2)}</span>
        <span>Day {days}</span>
      </div>
    </div>
  );
}
