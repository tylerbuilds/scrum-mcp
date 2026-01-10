interface ThroughputChartProps {
  data: number[];
  title?: string;
}

function getDayLabel(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function ThroughputChart({ data, title = 'Daily Throughput' }: ThroughputChartProps) {
  const maxValue = Math.max(...data, 1);
  const days = data.length;

  // Reverse to show oldest on left, newest on right
  const reversedData = [...data].reverse();

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-medium text-slate-300">{title}</h3>}

      <div className="flex items-end gap-2 h-32">
        {reversedData.map((value, idx) => {
          const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
          const daysAgo = days - 1 - idx;
          const dayLabel = getDayLabel(daysAgo);
          const isToday = daysAgo === 0;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              {/* Bar */}
              <div className="w-full relative flex flex-col justify-end h-24">
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    isToday
                      ? 'bg-gradient-to-t from-cyan-600 to-cyan-400'
                      : 'bg-gradient-to-t from-slate-600 to-slate-500'
                  }`}
                  style={{ height: `${Math.max(height, 4)}%` }}
                  title={`${value} task${value !== 1 ? 's' : ''} completed`}
                />
                {/* Value label above bar */}
                {value > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-slate-400">
                    {value}
                  </span>
                )}
              </div>

              {/* Day label */}
              <span className={`text-xs ${isToday ? 'text-cyan-400 font-medium' : 'text-slate-500'}`}>
                {isToday ? 'Today' : dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
        <span>Last {days} days</span>
        <span className="text-slate-600">|</span>
        <span>Total: {data.reduce((a, b) => a + b, 0)} tasks</span>
      </div>
    </div>
  );
}
