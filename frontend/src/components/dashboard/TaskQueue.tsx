import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ListTodo, Clock, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface TaskQueueProps {
  onTaskClick?: (taskId: string) => void;
}

export function TaskQueue({ onTaskClick }: TaskQueueProps) {
  const { tasks } = useScrumStore();

  // Get backlog and in-progress tasks
  const queuedTasksAll = tasks
    .filter(t => t.status === 'backlog' || t.status === 'todo')
    .sort((a, b) => {
      // Sort by priority first
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Then by created date (oldest first)
      return a.createdAt - b.createdAt;
    });

  const queuedTasks = queuedTasksAll.slice(0, 10); // Show top 10

  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');

  return (
    <Card className="bg-stone-950/60 border-stone-800 backdrop-blur-sm relative overflow-hidden">
      <CardHeader>
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
          <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 border-amber-500/50">
            {queuedTasksAll.length} Ready
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <AnimatePresence mode="popLayout">
          {queuedTasks.length === 0 && inProgressTasks.length === 0 ? (
            <motion.div
              key="no-tasks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <ListTodo className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <p className="text-stone-500">Queue is empty</p>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {/* In-progress tasks first */}
              {inProgressTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="p-3 rounded bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-amber-300">{task.id.slice(0, 8)}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 text-xs">
                          ACTIVE
                        </Badge>
                        {task.priority && (
                          <Badge variant="outline" className="text-xs">
                            {task.priority}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-sm text-stone-100 font-medium line-clamp-2">
                        {task.title}
                      </h4>
                      {task.assignedAgent && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-stone-500">
                          <User className="w-3 h-3" />
                          <span className="truncate">{task.assignedAgent}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Queued tasks */}
              {queuedTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: (index + (inProgressTasks.length || 0)) * 0.05 }}
                  className="p-3 rounded bg-stone-950/60 border border-stone-800 hover:border-amber-500/40 hover:bg-stone-950 transition-all cursor-pointer group"
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-stone-500">{task.id.slice(0, 8)}</span>
                        {task.priority && (
                          <Badge
                            variant="outline"
                            className={
                              task.priority === 'high'
                                ? 'border-red-500/50 text-red-400 text-xs'
                              : task.priority === 'medium'
                                ? 'border-yellow-500/50 text-yellow-400 text-xs'
                                : 'border-stone-500/50 text-stone-400 text-xs'
                            }
                          >
                            {task.priority}
                          </Badge>
                        )}
                        <span className="text-xs text-stone-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                      <h4 className="text-sm text-stone-300 font-medium line-clamp-2 group-hover:text-stone-100">
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-xs text-stone-500 mt-1 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {queuedTasksAll.length > 10 && (
          <div className="mt-3 text-center text-xs text-stone-500">
            Showing 10 of {queuedTasksAll.length} queued tasks
          </div>
        )}
      </CardContent>
    </Card>
  );
}
