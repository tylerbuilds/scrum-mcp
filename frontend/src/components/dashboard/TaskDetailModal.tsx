import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ClipboardList,
  Clock,
  User,
  Calendar,
  Target,
  Lock,
  GitBranch,
  Activity,
  FileText,
  AlertCircle,
  CheckCircle,
  Circle,
  Play,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { apiFetch } from '../../config/api';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgent: string | null;
  labels: string[];
  storyPoints: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  blockers: any[];
  dependencies: any[];
}

const statusConfig: Record<string, { color: string; icon: typeof Circle; label: string }> = {
  backlog: { color: 'bg-stone-500/20 text-stone-300 border-stone-500/50', icon: Circle, label: 'Backlog' },
  todo: { color: 'bg-blue-500/20 text-blue-300 border-blue-500/50', icon: Circle, label: 'To Do' },
  in_progress: { color: 'bg-amber-500/20 text-amber-300 border-amber-500/50', icon: Play, label: 'In Progress' },
  review: { color: 'bg-purple-500/20 text-purple-400 border-purple-500/50', icon: Activity, label: 'Review' },
  done: { color: 'bg-lime-500/20 text-lime-400 border-lime-500/50', icon: CheckCircle, label: 'Done' },
  cancelled: { color: 'bg-red-500/20 text-red-400 border-red-500/50', icon: X, label: 'Cancelled' },
};

const priorityConfig: Record<string, string> = {
  critical: 'border-red-500/50 text-red-400 bg-red-500/10',
  high: 'border-orange-500/50 text-orange-400 bg-orange-500/10',
  medium: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10',
  low: 'border-stone-500/50 text-stone-400 bg-stone-500/10',
};

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    const fetchTask = async () => {
      setLoading(true);
      try {
        const response = await apiFetch<{ data: { task: TaskDetail } }>(`/api/tasks/${taskId}`);
        setTask(response.data.task);
      } catch (err) {
        console.error('Failed to fetch task:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [taskId]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Tab') {
      e.preventDefault();
      setActiveTab(prev => prev === 'details' ? 'activity' : 'details');
    }
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Build activity timeline from task data
  const buildTimeline = (task: TaskDetail) => {
    const events = [
      { type: 'created', time: task.createdAt, label: 'Task created' },
    ];

    if (task.startedAt) {
      events.push({ type: 'started', time: task.startedAt, label: 'Work started' });
    }
    if (task.completedAt) {
      events.push({ type: 'completed', time: task.completedAt, label: 'Task completed' });
    }
    if (task.updatedAt > task.createdAt) {
      events.push({ type: 'updated', time: task.updatedAt, label: 'Last updated' });
    }

    return events.sort((a, b) => b.time - a.time);
  };

  const status = task ? statusConfig[task.status] || statusConfig.backlog : statusConfig.backlog;
  const StatusIcon = status.icon;

  return (
    <AnimatePresence>
      {taskId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Header */}
              <div className="relative p-6 border-b border-stone-800 bg-gradient-to-r from-stone-950 via-stone-900/50 to-stone-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.08),transparent_50%)]" />

                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex-shrink-0"
                    >
                      <ClipboardList className="w-6 h-6 text-amber-400" />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold text-stone-100 leading-tight">
                        {task?.title || 'Loading...'}
                      </h2>
                      {task && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <code className="text-xs text-stone-500 font-mono bg-stone-900 px-2 py-0.5 rounded">
                            {task.id.slice(0, 12)}
                          </code>
                          <Badge className={status.color}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {status.label}
                          </Badge>
                          {task.priority && (
                            <Badge className={priorityConfig[task.priority] || priorityConfig.medium}>
                              {task.priority === 'critical' && <AlertCircle className="w-3 h-3 mr-1" />}
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-stone-800 rounded-lg transition-colors flex-shrink-0"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5 text-stone-400" />
                  </button>
                </div>

                {/* Tabs */}
                {task && (
                  <div className="relative flex gap-1 mt-4 p-1 bg-stone-900/50 rounded-lg border border-stone-800 w-fit">
                    {(['details', 'activity'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                          'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                          activeTab === tab
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-stone-400 hover:text-stone-200'
                        )}
                      >
                        {tab === 'details' ? (
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Details
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            Activity
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="space-y-4">
                    <div className="animate-pulse h-4 bg-stone-800 rounded w-3/4" />
                    <div className="animate-pulse h-4 bg-stone-800 rounded w-1/2" />
                    <div className="animate-pulse h-24 bg-stone-800 rounded" />
                  </div>
                ) : task ? (
                  <AnimatePresence mode="wait">
                    {activeTab === 'details' ? (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-6"
                      >
                        {/* Description */}
                        {task.description && (
                          <div>
                            <h3 className="text-sm font-semibold text-stone-400 mb-2 flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Description
                            </h3>
                            <p className="text-stone-300 leading-relaxed">{task.description}</p>
                          </div>
                        )}

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <MetadataCard
                            icon={User}
                            label="Assigned Agent"
                            value={task.assignedAgent}
                            placeholder="Unassigned"
                          />
                          <MetadataCard
                            icon={Target}
                            label="Story Points"
                            value={task.storyPoints?.toString()}
                            placeholder="Not set"
                          />
                          <MetadataCard
                            icon={Calendar}
                            label="Created"
                            value={formatDistanceToNow(task.createdAt, { addSuffix: true })}
                          />
                          <MetadataCard
                            icon={Clock}
                            label="Updated"
                            value={formatDistanceToNow(task.updatedAt, { addSuffix: true })}
                          />
                        </div>

                        {/* Labels */}
                        {task.labels && task.labels.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-stone-400 mb-2">Labels</h3>
                            <div className="flex flex-wrap gap-2">
                              {task.labels.map(label => (
                                <Badge
                                  key={label}
                                  variant="secondary"
                                  className="text-xs bg-stone-900 text-stone-200 border border-stone-700"
                                >
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Blockers */}
                        {task.blockers && task.blockers.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                              <Lock className="w-4 h-4" />
                              Blockers ({task.blockers.length})
                            </h3>
                            <div className="space-y-2">
                              {task.blockers.map((blocker: any) => (
                                <div key={blocker.id} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                  <div className="text-sm text-stone-200">{blocker.description}</div>
                                  <div className="text-xs text-stone-500 mt-1">
                                    Blocked {formatDistanceToNow(blocker.createdAt, { addSuffix: true })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dependencies */}
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-stone-400 mb-2 flex items-center gap-2">
                              <GitBranch className="w-4 h-4" />
                              Dependencies ({task.dependencies.length})
                            </h3>
                            <div className="space-y-2">
                              {task.dependencies.map((dep: any) => (
                                <div
                                  key={dep.taskId}
                                  className="bg-stone-900/60 border border-stone-800 rounded-lg p-3 flex items-center justify-between gap-3"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-stone-200 truncate">{dep.title}</div>
                                    <code className="text-xs text-stone-500 font-mono">{dep.taskId.slice(0, 12)}</code>
                                  </div>
                                  <Badge
                                    className={clsx(
                                      'text-xs flex-shrink-0',
                                      dep.status === 'done'
                                        ? 'border-lime-500/50 text-lime-400 bg-lime-500/10'
                                        : 'border-stone-500/50 text-stone-400 bg-stone-500/10'
                                    )}
                                  >
                                    {dep.status === 'done' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {dep.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="activity"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-4"
                      >
                        <h3 className="text-sm font-semibold text-stone-400 flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          Activity Timeline
                        </h3>
                        <div className="relative">
                          {/* Timeline line */}
                          <div className="absolute left-3 top-2 bottom-2 w-px bg-stone-800" />

                          {/* Timeline events */}
                          <div className="space-y-4">
                            {buildTimeline(task).map((event, idx) => (
                              <div key={idx} className="relative flex items-start gap-4 pl-8">
                                <div className={clsx(
                                  'absolute left-0 w-6 h-6 rounded-full border-2 flex items-center justify-center',
                                  event.type === 'completed'
                                    ? 'bg-lime-500/20 border-lime-500'
                                    : event.type === 'started'
                                    ? 'bg-amber-500/20 border-amber-500'
                                    : 'bg-stone-800 border-stone-600'
                                )}>
                                  {event.type === 'completed' ? (
                                    <CheckCircle className="w-3 h-3 text-lime-400" />
                                  ) : event.type === 'started' ? (
                                    <Play className="w-3 h-3 text-amber-400" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-stone-400" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 pb-4">
                                  <p className="text-sm text-stone-200">{event.label}</p>
                                  <p className="text-xs text-stone-500 mt-0.5">
                                    {format(event.time, 'MMM d, yyyy h:mm a')}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ) : (
                  <div className="text-center py-8 text-stone-500">
                    Failed to load task details
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-stone-800 bg-stone-950 flex items-center justify-between text-xs text-stone-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-800 font-mono">Esc</kbd>
                    close
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-800 font-mono">Tab</kbd>
                    switch tab
                  </span>
                </div>
                {task && (
                  <span className="text-stone-600">
                    ID: {task.id}
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// Helper component for metadata cards
function MetadataCard({
  icon: Icon,
  label,
  value,
  placeholder,
}: {
  icon: typeof Clock;
  label: string;
  value?: string | null;
  placeholder?: string;
}) {
  return (
    <div className="bg-stone-900/60 rounded-lg p-3 border border-stone-800">
      <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-sm text-stone-200">
        {value || <span className="text-stone-500 italic">{placeholder}</span>}
      </div>
    </div>
  );
}
