import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { ComplianceFramework } from '@/types'

const fetchFrameworks = async (): Promise<ComplianceFramework[]> => {
  const res = await fetch('/api/frameworks', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

const fetchComplianceScores = async () => {
  const res = await fetch('/api/compliance-scores', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Compliance() {
  const { data: frameworks = [], isLoading } = useQuery({ queryKey: ['frameworks'], queryFn: fetchFrameworks })
  const { data: scores = [], isLoading: scoresLoading } = useQuery({ queryKey: ['compliance-scores'], queryFn: fetchComplianceScores })

  if (isLoading || scoresLoading) return <div className="p-6">Loading compliance data...</div>

  const avgScore = scores.length > 0 
    ? scores.reduce((sum, s) => sum + (s.avg_score || 0), 0) / scores.length 
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compliance Management</h1>
        <Button>+ Add Framework</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Frameworks</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{frameworks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Avg Compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{avgScore.toFixed(1)}%</div>
            <Progress value={avgScore} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Status</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">Active</div>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Compliance Frameworks</h2>
        <div className="space-y-2">
          {frameworks.map(f => (
            <div key={f.id} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <span className="text-sm text-muted-foreground">{f.version}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
            </div>
          ))}
          {frameworks.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No frameworks yet. Add ISO 27001, NIST, or other frameworks.
            </p>
          )}
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Compliance Scores</h2>
        <div className="space-y-2">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">{s.framework}</span>
              <div className="flex items-center gap-2">
                <Progress value={s.avg_score || 0} className="w-32" />
                <span className="text-sm font-medium">{(s.avg_score || 0).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
