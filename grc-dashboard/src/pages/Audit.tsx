import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const fetchAuditFindings = async () => {
  const res = await fetch('/api/audit-findings', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Audit() {
  const { data: findings = [], isLoading } = useQuery({ queryKey: ['audit-findings'], queryFn: fetchAuditFindings })

  if (isLoading) return <div className="p-6">Loading audit data...</div>

  const openFindings = findings.filter(f => f.status === 'open').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit & Assurance</h1>
        <Button>+ Plan Audit</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Findings</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{findings.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-500">{openFindings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Resolved</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-500">{findings.length - openFindings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Next Audit</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">TBD</div></CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Audit Findings</h2>
        <div className="space-y-2">
          {findings.map(f => (
            <div key={f.id} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.description || 'Audit Finding'}</span>
                <Badge variant={f.severity === 'high' ? 'destructive' : f.severity === 'medium' ? 'default' : 'secondary'}>
                  {f.severity}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{f.recommendation}</p>
              <div className="mt-2">
                <Badge variant={f.status === 'open' ? 'destructive' : 'default'}>{f.status}</Badge>
                {f.due_date && <span className="text-sm text-muted-foreground ml-2">Due: {new Date(f.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
          {findings.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No audit findings yet. Plan your first audit.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
