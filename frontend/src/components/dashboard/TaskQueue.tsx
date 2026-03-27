import { useState, useMemo } from 'react';
import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ListTodo, Clock, User, ArrowUpDown, Filter, ChevronDown, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { TaskPriority } from '../../types/scrum';

interface TaskQueueProps {
  onTaskClick?: (taskId: string) => void;
}

type SortOption = 'priority' | 'created' | 'title';
type FilterStatus = 'all' | 'backlog' | 'todo' | 'in_progress';

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_COLORS: Record<FilterStatus | string, string> = {
  all: 'bg-stone-500/20 text-stone-300 border-stone-500/50',
  backlog: 'bg-stone-500/20 text-stone-400 border-stone-500/50',
  todo: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: 'border-red-500/50 text-red-400 bg-red-500/10',
  high: 'border-orange-500/50 text-orange-400 bg-orange-500/10',
  medium: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10',
  low: 'border-stone-500/50 text-stone-400 bg-stone-500/10',
};

export function TaskQueue({ onTaskClick }: TaskQueueProps) {
  const { tasks } = useScrumStore();
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(t =>
      t.status === 'backlog' || t.status === 'todo' || t.status === 'in_progress'
    );

    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const aPriority = PRIORITY_ORDER[a.priority] ?? 2;
          const bPriority = PRIORITY_ORDER[b.priority] ?? 2;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return b.createdAt - a.createdAt;
        case 'created':
          return b.createdAt - a.createdAt;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
  }, [tasks, sortBy, filterStatus]);

  const displayTasks = filteredTasks.slice(0, 15);
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const backlogCount = tasks.filter(t => t.status === 'backlog').length;
  const todoCount = tasks.filter(t => t.status === 'todo').length;

  return (
    <Card className="bg-stone-950/60 border-stone-800 backdrop-blur-sm relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            >
              <ListTodo className="w-5 h-5 text-amber-400" />
            </motion.div>
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-lime-300 bg-clip-text text-transparent font-bold">
              TASK TRAFFIC
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-xs">
              {inProgressCount} Active
            </Badge>
            <Badge variant="secondary" className="bg-stone-500/20 text-stone-300 border-stone-500/50 text-xs">
              {backlogCount + todoCount} Queued
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      {/* Filters & Sort */}
      <div className="px-6 pb-3 flex flex-wrap items-center gap-2">
        {/* Status Filters */}
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-stone-500" />
          {(['all', 'in_progress', 'todo', 'backlog'] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2 py-0.5 text-xs rounded-md border transition-all ${
                filterStatus === status
                  ? STATUS_COLORS[status]
                  : 'bg-transparent border-transparent text-stone-500 hover:text-stone-300'
              }`}
            >
              {status === 'all' ? 'All' : status === 'in_progress' ? 'Active' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-stone-400 hover:text-stone-200 rounded-md hover:bg-stone-800 transition-colors"
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortBy === 'priority' ? 'Priority' : sortBy === 'created' ? 'Newest' : 'Title'}
            <ChevronDown className="w-3 h-3" />
          </button>

          <AnimatePresence>
            {showSortMenu && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute right-0 top-full mt-1 z-10 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden"
              >
                {(['priority', 'created', 'title'] as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setSortBy(option);
                      setShowSortMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-xs text-left hover:bg-stone-800 transition-colors ${
                      sortBy === option ? 'text-amber-300' : 'text-stone-300'
                    }`}
                  >
                    {option === 'priority' ? 'Priority' : option === 'created' ? 'Newest First' : 'Title A-Z'}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <CardContent className="pt-0">
        <AnimatePresence mode="popLayout">
          {displayTasks.length === 0 ? (
            <motion.div
              key="no-tasks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <ListTodo className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <p className="text-stone-500">No tasks match your filter</p>
              <button
                onClick={() => setFilterStatus('all')}
                className="mt-2 text-xs text-amber-400 hover:text-amber-300"
              >
                Clear filters
              </button>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {displayTasks.map((task, index) => {
                const isActive = task.status === 'in_progress';

                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className={`p-3 rounded-lg border transition-all cursor-pointer group ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-stone-950/60 border-stone-800 hover:border-amber-500/40 hover:bg-stone-900/80'
                    }`}
                    onClick={() => onTaskClick?.(task.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-stone-500">{task.id.slice(0, 8)}</span>

                          {isActive && (
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-[10px] px-1.5">
                              ACTIVE
                            </Badge>
                          )}

                          {task.priority && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 ${PRIORITY_COLORS[task.priority]}`}
                            >
                              {task.priority === 'critical' && <AlertCircle className="w-2.5 h-2.5 mr-0.5" />}
                              {task.priority}
                            </Badge>
                          )}

                          <span className="text-[10px] text-stone-500 flex items-center gap-1 ml-auto">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                          </span>
                        </div>

                        <h4 className={`text-sm font-medium line-clamp-2 transition-colors ${
                          isActive ? 'text-stone-100' : 'text-stone-300 group-hover:text-stone-100'
                        }`}>
                          {task.title}
                        </h4>

                        {task.description && !isActive && (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-1">
                            {task.description}
                          </p>
                        )}

                        {task.assignedAgent && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-stone-500">
                            <User className="w-3 h-3" />
                            <span className="truncate">{task.assignedAgent}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {filteredTasks.length > 15 && (
          <div className="mt-4 pt-3 border-t border-stone-800 text-center">
            <span className="text-xs text-stone-500">
              Showing 15 of {filteredTasks.length} tasks
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
