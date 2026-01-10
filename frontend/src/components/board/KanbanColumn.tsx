import { Task, TaskCard } from './TaskCard';
import { WipIndicator, WipStatusItem } from './WipIndicator';

export type ColumnStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

interface KanbanColumnProps {
  status: ColumnStatus;
  tasks: Task[];
  wipStatus?: WipStatusItem;
  onTaskClick?: (task: Task) => void;
}

function getColumnConfig(status: ColumnStatus) {
  switch (status) {
    case 'backlog':
      return {
        title: 'Backlog',
        headerBg: 'bg-slate-700/50',
        headerText: 'text-slate-300',
        borderColor: 'border-slate-600',
        countBg: 'bg-slate-600',
        countText: 'text-slate-200',
      };
    case 'todo':
      return {
        title: 'To Do',
        headerBg: 'bg-blue-500/20',
        headerText: 'text-blue-300',
        borderColor: 'border-blue-500/30',
        countBg: 'bg-blue-500/30',
        countText: 'text-blue-200',
      };
    case 'in_progress':
      return {
        title: 'In Progress',
        headerBg: 'bg-amber-500/20',
        headerText: 'text-amber-300',
        borderColor: 'border-amber-500/30',
        countBg: 'bg-amber-500/30',
        countText: 'text-amber-200',
      };
    case 'review':
      return {
        title: 'Review',
        headerBg: 'bg-purple-500/20',
        headerText: 'text-purple-300',
        borderColor: 'border-purple-500/30',
        countBg: 'bg-purple-500/30',
        countText: 'text-purple-200',
      };
    case 'done':
      return {
        title: 'Done',
        headerBg: 'bg-green-500/20',
        headerText: 'text-green-300',
        borderColor: 'border-green-500/30',
        countBg: 'bg-green-500/30',
        countText: 'text-green-200',
      };
    default:
      return {
        title: 'Unknown',
        headerBg: 'bg-slate-700/50',
        headerText: 'text-slate-300',
        borderColor: 'border-slate-600',
        countBg: 'bg-slate-600',
        countText: 'text-slate-200',
      };
  }
}

export function KanbanColumn({ status, tasks, wipStatus, onTaskClick }: KanbanColumnProps) {
  const config = getColumnConfig(status);
  const showWipIndicator = wipStatus && wipStatus.limit !== undefined;

  return (
    <div
      className={`flex-1 min-w-[250px] max-w-[350px] flex flex-col bg-slate-900/50 rounded-lg border ${
        wipStatus?.exceeded ? 'border-red-500/50' : 'border-slate-700'
      }`}
    >
      {/* Column Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${config.headerBg} border-b ${config.borderColor} rounded-t-lg`}
      >
        <h3 className={`text-sm font-semibold ${config.headerText}`}>{config.title}</h3>
        <div className="flex items-center gap-1.5">
          {showWipIndicator ? (
            <WipIndicator wipStatus={wipStatus} />
          ) : (
            <span
              className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded ${config.countBg} ${config.countText}`}
            >
              {tasks.length}
            </span>
          )}
        </div>
      </div>

      {/* Column Body - Scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-280px)]">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No tasks</div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))
        )}
      </div>
    </div>
  );
}
