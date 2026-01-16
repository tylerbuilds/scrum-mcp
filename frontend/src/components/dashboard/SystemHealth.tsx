import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent } from '../ui/card';
import { BarChart2, CheckCircle, ClipboardList, Circle } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { MetricValue } from './AnimatedCard';

export function SystemHealth() {
  const { metrics, tasks } = useScrumStore();

  // Calculate real metrics from actual tasks
  const totalTasks = tasks.length;
  const backlogTasks = tasks.filter(t => t.status === 'backlog').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const activeWork = inProgressTasks; // Only tasks actually being worked on

  // Get throughput data (with fallback)
  const throughputData = metrics?.throughputDaily?.map((count, i) => ({
    day: `Day ${i + 1}`,
    count
  })) || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
    >
      {/* Total Tasks Card */}
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-gradient-to-br from-stone-900 to-stone-950 border-stone-800 hover:border-amber-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Total Tasks</p>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              >
                <ClipboardList className="w-4 h-4 text-amber-400" />
              </motion.div>
            </div>
            <div className="text-3xl font-bold text-stone-100 flex items-center gap-2">
              <MetricValue value={totalTasks} />
              <span className="text-sm font-normal text-stone-400">in system</span>
            </div>
            <div className="mt-2 flex gap-1 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                {backlogTasks} backlog
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                {inProgressTasks} active
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Active Work Card */}
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-gradient-to-br from-stone-900 to-stone-950 border-stone-800 hover:border-lime-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Active Work</p>
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Circle className="w-4 h-4 text-lime-400" />
              </motion.div>
            </div>
            <div className="text-3xl font-bold text-stone-100 flex items-center gap-2">
              <MetricValue value={activeWork} />
              <span className="text-sm font-normal text-stone-400">tasks</span>
            </div>
            <div className="mt-2 flex gap-1 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                {backlogTasks} not started
              </span>
              <span className="px-1.5 py-0.5 rounded bg-lime-500/20 text-lime-300">
                {inProgressTasks} active
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Completed Card */}
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-gradient-to-br from-stone-900 to-stone-950 border-stone-800 hover:border-emerald-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Completed</p>
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </motion.div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent flex items-center gap-2">
              <MetricValue value={completedTasks} />
            </div>
            <div className="mt-2 text-xs text-stone-500">
              {totalTasks > 0 ? `${Math.round(completedTasks / totalTasks * 100)}% complete` : 'No tasks yet'}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Throughput Card */}
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-gradient-to-br from-stone-900 to-stone-950 border-stone-800 hover:border-orange-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">7-Day Trend</p>
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <BarChart2 className="w-4 h-4 text-orange-400" />
              </motion.div>
            </div>
            {throughputData.length > 0 ? (
              <div className="h-[50px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughputData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#f97316"
                      fill="url(#colorCount)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[50px] flex items-center justify-center text-xs text-stone-500">
                No data yet
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
