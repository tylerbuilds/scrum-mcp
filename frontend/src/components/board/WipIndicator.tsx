import { AlertTriangle } from 'lucide-react';

export interface WipStatusItem {
  status: string;
  count: number;
  limit?: number;
  exceeded: boolean;
}

interface WipIndicatorProps {
  wipStatus: WipStatusItem;
  showTooltip?: boolean;
}

function getWipColorClasses(wipStatus: WipStatusItem): {
  bg: string;
  text: string;
  border: string;
} {
  if (!wipStatus.limit) {
    // No limit set
    return {
      bg: 'bg-slate-600',
      text: 'text-slate-200',
      border: 'border-slate-500',
    };
  }

  if (wipStatus.exceeded) {
    // Over limit - red
    return {
      bg: 'bg-red-500/30',
      text: 'text-red-300',
      border: 'border-red-500/50',
    };
  }

  if (wipStatus.count === wipStatus.limit) {
    // At limit - amber
    return {
      bg: 'bg-amber-500/30',
      text: 'text-amber-300',
      border: 'border-amber-500/50',
    };
  }

  // Under limit - green
  return {
    bg: 'bg-green-500/20',
    text: 'text-green-300',
    border: 'border-green-500/30',
  };
}

export function WipIndicator({ wipStatus, showTooltip = true }: WipIndicatorProps) {
  const { limit, count, exceeded } = wipStatus;
  const colors = getWipColorClasses(wipStatus);

  // If no limit is set, show simple count
  if (!limit) {
    return (
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded ${colors.bg} ${colors.text}`}
        title={showTooltip ? 'No WIP limit set' : undefined}
      >
        {count}
      </span>
    );
  }

  const tooltipText = exceeded
    ? `WIP limit exceeded! ${count} of ${limit} allowed`
    : count === limit
    ? `At WIP limit: ${count}/${limit}`
    : `${count} of ${limit} WIP limit`;

  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-1.5 text-xs font-medium rounded border ${colors.bg} ${colors.text} ${colors.border}`}
      title={showTooltip ? tooltipText : undefined}
    >
      {exceeded && <AlertTriangle className="w-3 h-3" />}
      <span>
        {count}/{limit}
      </span>
    </span>
  );
}
