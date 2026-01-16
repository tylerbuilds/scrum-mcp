import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardList, Clock, User, Calendar, Target, Lock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { apiFetch } from '../../config/api';
import { formatDistanceToNow } from 'date-fns';
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

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const statusColors: Record<string, string> = {
    backlog: 'bg-stone-500/20 text-stone-300 border-stone-500/50',
    todo: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    in_progress: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
    review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

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
              className="bg-stone-950 border border-stone-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-stone-800">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  >
                    <ClipboardList className="w-6 h-6 text-amber-400 flex-shrink-0" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-stone-100 truncate">{task?.title || 'Loading...'}</h2>
                    {task && (
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs text-stone-500">{task.id}</code>
                        <Badge className={statusColors[task.status] || 'bg-stone-500/20 text-stone-400'}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                        {task.priority && (
                          <Badge variant="outline" className="text-xs">
                            {task.priority}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-stone-900 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                {loading ? (
                  <div className="space-y-4">
                    <div className="animate-pulse h-4 bg-stone-800 rounded w-3/4" />
                    <div className="animate-pulse h-4 bg-stone-800 rounded w-1/2" />
                    <div className="animate-pulse h-20 bg-stone-800 rounded" />
                  </div>
                ) : task ? (
                  <div className="space-y-6">
                    {/* Description */}
                    {task.description && (
                      <div>
                        <h3 className="text-sm font-semibold text-stone-400 mb-2">Description</h3>
                        <p className="text-stone-300">{task.description}</p>
                      </div>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-stone-900/60 rounded-lg p-3 border border-stone-800">
                        <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
                          <User className="w-3 h-3" />
                          Assigned Agent
                        </div>
                        <div className="text-sm text-stone-200">
                          {task.assignedAgent || (
                            <span className="text-stone-500 italic">Unassigned</span>
                          )}
                        </div>
                      </div>

                      <div className="bg-stone-900/60 rounded-lg p-3 border border-stone-800">
                        <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
                          <Target className="w-3 h-3" />
                          Story Points
                        </div>
                        <div className="text-sm text-stone-200">
                          {task.storyPoints || (
                            <span className="text-stone-500 italic">Not set</span>
                          )}
                        </div>
                      </div>

                      <div className="bg-stone-900/60 rounded-lg p-3 border border-stone-800">
                        <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
                          <Calendar className="w-3 h-3" />
                          Created
                        </div>
                        <div className="text-sm text-stone-200">
                          {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                        </div>
                      </div>

                      <div className="bg-stone-900/60 rounded-lg p-3 border border-stone-800">
                        <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
                          <Clock className="w-3 h-3" />
                          Updated
                        </div>
                        <div className="text-sm text-stone-200">
                          {formatDistanceToNow(task.updatedAt, { addSuffix: true })}
                        </div>
                      </div>
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
                          <Lock className="w-3 h-3" />
                          Blockers ({task.blockers.length})
                        </h3>
                        <div className="space-y-2">
                          {task.blockers.map((blocker: any) => (
                            <div key={blocker.id} className="bg-red-500/10 border border-red-500/30 rounded p-2">
                              <div className="text-sm text-stone-200">{blocker.description}</div>
                              <div className="text-xs text-stone-500 mt-1">
                                Blocked since {formatDistanceToNow(blocker.createdAt, { addSuffix: true })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dependencies */}
                    {task.dependencies && task.dependencies.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-stone-400 mb-2">Dependencies ({task.dependencies.length})</h3>
                        <div className="space-y-2">
                          {task.dependencies.map((dep: any) => (
                            <div key={dep.taskId} className="bg-stone-900/60 border border-stone-800 rounded p-2 flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-stone-200 truncate">{dep.title}</div>
                                <code className="text-xs text-stone-500">{dep.taskId}</code>
                              </div>
                              <Badge
                                variant="outline"
                                className={clsx(
                                  'text-xs',
                                  dep.status === 'done' && 'border-emerald-500/50 text-emerald-400',
                                  dep.status !== 'done' && 'border-stone-500/50 text-stone-400'
                                )}
                              >
                                {dep.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-stone-500">
                    Failed to load task details
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
