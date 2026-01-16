import { useEffect, useState } from 'react';
import { useScrumStore } from '../../store/useScrumStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import { apiFetch } from '../../config/api';

interface TaskCompliance {
  taskId: string;
  taskTitle: string;
  allCompliant: boolean;
  agentCount: number;
}

export function ComplianceSummary() {
  const { tasks } = useScrumStore();
  const [complianceData, setComplianceData] = useState<TaskCompliance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompliance = async () => {
      try {
        // Only fetch compliance for in-progress tasks
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
        const promises = inProgressTasks.map(task =>
          apiFetch<{ data: TaskCompliance }>(`/api/compliance/${task.id}`)
            .then(res => res.data)
            .catch(() => null)
        );

        const results = await Promise.all(promises);
        setComplianceData(results.filter(r => r !== null) as TaskCompliance[]);
      } catch (err) {
        console.error('Failed to fetch compliance:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompliance();
  }, [tasks]);

  const compliantCount = complianceData.filter(d => d.allCompliant).length;
  const totalCount = complianceData.length;
  const hasIssues = totalCount > 0 && compliantCount < totalCount;

  if (loading) {
    return (
      <Card className="bg-stone-950/70 border-stone-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-4 bg-stone-800 rounded w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card className="bg-stone-950/70 border-stone-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-stone-500">No active tasks to check</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-stone-950/70 border-stone-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            Compliance Status
          </div>
          {hasIssues ? (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
              {compliantCount}/{totalCount}
            </Badge>
          ) : (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
              <CheckCircle className="w-3 h-3 mr-1" />
              All Clear
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
        {complianceData.map(data => (
          <div
            key={data.taskId}
            className="flex items-center justify-between p-2 rounded bg-stone-950/60 hover:bg-stone-950 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-300 truncate">{data.taskTitle}</p>
              <p className="text-xs text-stone-500">{data.agentCount} agent{data.agentCount !== 1 ? 's' : ''}</p>
            </div>
            {data.allCompliant ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 ml-2" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
