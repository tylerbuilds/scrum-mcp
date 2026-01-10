import { Clock, AlertTriangle, CheckCircle, User } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { AgentBadge } from '../lobby/AgentBadge';

export interface AgingWipItem {
  taskId: string;
  title: string;
  daysInProgress: number;
  assignedAgent?: string;
}

interface AgingWipListProps {
  items: AgingWipItem[];
  onTaskClick?: (taskId: string) => void;
}

function getAgingConfig(days: number) {
  if (days <= 1) {
    return {
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      icon: CheckCircle,
      label: 'On Track',
    };
  } else if (days <= 4) {
    return {
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      icon: Clock,
      label: 'Getting Old',
    };
  } else {
    return {
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      icon: AlertTriangle,
      label: 'At Risk',
    };
  }
}

export function AgingWipList({ items, onTaskClick }: AgingWipListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-12 h-12 text-green-500/50 mx-auto mb-3" />
        <p className="text-slate-400">No aging tasks in progress</p>
        <p className="text-xs text-slate-500 mt-1">All work is flowing smoothly</p>
      </div>
    );
  }

  // Sort by days in progress, highest first
  const sortedItems = [...items].sort((a, b) => b.daysInProgress - a.daysInProgress);

  return (
    <div className="space-y-2">
      {sortedItems.map((item) => {
        const config = getAgingConfig(item.daysInProgress);
        const StatusIcon = config.icon;

        return (
          <Card
            key={item.taskId}
            className={`${config.bgColor} ${config.borderColor} border p-3 cursor-pointer hover:border-opacity-60 transition-all`}
            onClick={() => onTaskClick?.(item.taskId)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <StatusIcon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-200 truncate" title={item.title}>
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {item.assignedAgent ? (
                      <AgentBadge agentId={item.assignedAgent} size="sm" />
                    ) : (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Badge className={`${config.bgColor} ${config.color} border-0 text-xs`}>
                  {item.daysInProgress} day{item.daysInProgress !== 1 ? 's' : ''}
                </Badge>
                <span className={`text-xs ${config.color}`}>{config.label}</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
