import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Risk } from '@/types'

const fetchRisks = async (): Promise<Risk[]> => {
  const res = await fetch('/api/risks', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Risks() {
  const { data: risks = [], isLoading } = useQuery({ queryKey: ['risks'], queryFn: fetchRisks })

  if (isLoading) return <div className="p-6">Loading risks...</div>

  const openRisks = risks.filter(r => r.status === 'open').length
  const avgRisk = risks.length > 0 
    ? risks.reduce((sum, r) => sum + (r.risk_score || 0), 0) / risks.length 
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Risk Management</h1>
        <Button>+ Add Risk</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Risks</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{risks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open Risks</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-500">{openRisks}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Avg Risk Score</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{avgRisk.toFixed(1)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(risks.map(r => r.category)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Risk Register</h2>
        <div className="space-y-2">
          {risks.map(r => (
            <div key={r.id} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.title}</span>
                <div className="flex gap-2">
                  <Badge variant={r.risk_score > 15 ? 'destructive' : r.risk_score > 10 ? 'default' : 'secondary'}>
                    Score: {r.risk_score}
                  </Badge>
                  <Badge variant={r.status === 'open' ? 'destructive' : 'default'}>
                    {r.status}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{r.category}</p>
              <p className="text-sm mt-2">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
