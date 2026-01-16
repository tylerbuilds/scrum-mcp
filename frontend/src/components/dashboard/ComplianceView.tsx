import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../config/api';

interface ComplianceCheck {
  passed: boolean;
  count?: number;
  violations?: string[];
  undeclared?: string[];
  activeClaims?: string[];
  intents?: any[];
}

interface AgentCompliance {
  agentId: string;
  compliant: boolean;
  score: number;
  checks: {
    intentPosted: ComplianceCheck;
    evidenceAttached: ComplianceCheck;
    filesMatch: ComplianceCheck;
    boundariesRespected: ComplianceCheck;
    claimsReleased: ComplianceCheck;
  };
}

interface ComplianceData {
  taskId: string;
  taskTitle: string;
  agentCount: number;
  allCompliant: boolean;
  agents: AgentCompliance[];
}

interface ComplianceViewProps {
  taskId?: string;
}

export function ComplianceView({ taskId }: ComplianceViewProps) {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    const fetchCompliance = async () => {
      try {
        const response = await apiFetch<ComplianceData>(`/api/compliance/${taskId}`);
        setData(response);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch compliance data');
      } finally {
        setLoading(false);
      }
    };

    fetchCompliance();
  }, [taskId]);

  if (!taskId) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Select a task to view compliance</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading compliance data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400">{error || 'Failed to load compliance data'}</p>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 100) return 'text-emerald-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getBarColor = (score: number) => {
    if (score >= 100) return 'bg-emerald-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">Compliance Report</h3>
        {data.allCompliant ? (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
            <CheckCircle className="w-3 h-3 mr-1" />
            All Compliant
          </Badge>
        ) : (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Issues Found
          </Badge>
        )}
      </div>

      {data.agents.map(agent => (
        <Card key={agent.agentId} className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{agent.agentId}</CardTitle>
              <div className={`text-2xl font-bold ${getScoreColor(agent.score)}`}>
                {agent.score}%
              </div>
            </div>
            <div className="mt-2">
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(agent.score)} transition-all`}
                  style={{ width: `${agent.score}%` }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ComplianceCheckItem
              label="Intent Posted"
              passed={agent.checks.intentPosted.passed}
              detail={`${agent.checks.intentPosted.count} intent(s)`}
            />
            <ComplianceCheckItem
              label="Evidence Attached"
              passed={agent.checks.evidenceAttached.passed}
              detail={`${agent.checks.evidenceAttached.count || 0} evidence(s)`}
            />
            <ComplianceCheckItem
              label="Files Match"
              passed={agent.checks.filesMatch.passed}
              detail={agent.checks.filesMatch.passed
                ? 'All modifications declared'
                : `Undeclared: ${agent.checks.filesMatch.undeclared?.join(', ') || 'unknown'}`
              }
            />
            <ComplianceCheckItem
              label="Boundaries Respected"
              passed={agent.checks.boundariesRespected.passed}
              detail={agent.checks.boundariesRespected.passed
                ? 'No violations'
                : `Violations: ${agent.checks.boundariesRespected.violations?.join(', ') || 'unknown'}`
              }
            />
            <ComplianceCheckItem
              label="Claims Released"
              passed={agent.checks.claimsReleased.passed}
              detail={agent.checks.claimsReleased.passed
                ? 'All claims released'
                : `Active: ${agent.checks.claimsReleased.activeClaims?.join(', ') || 'unknown'}`
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface ComplianceCheckItemProps {
  label: string;
  passed: boolean;
  detail: string;
}

function ComplianceCheckItem({ label, passed, detail }: ComplianceCheckItemProps) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {passed ? (
        <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 truncate">{detail}</div>
      </div>
    </div>
  );
}
