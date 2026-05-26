import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Control } from '@/types'

const fetchControls = async (): Promise<Control[]> => {
  const res = await fetch('/api/controls', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Controls() {
  const { data: controls = [], isLoading } = useQuery({ queryKey: ['controls'], queryFn: fetchControls })

  if (isLoading) return <div className="p-6">Loading controls...</div>

  const compliantCount = controls.filter(c => c.status === 'compliant').length
  const complianceRate = controls.length > 0 ? Math.round((compliantCount / controls.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Controls</h1>
        <Button>+ Add Control</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Controls</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{controls.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Compliant</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{compliantCount}</div>
            <Progress value={complianceRate} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Non-Compliant</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-500">
            {controls.filter(c => c.status !== 'compliant').length}
          </div></CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Control Mapping</h2>
        <div className="space-y-2">
          {controls.map(c => (
            <div key={c.id} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <Badge variant={c.status === 'compliant' ? 'default' : 'destructive'}>
                  {c.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{c.framework}</p>
              <div className="mt-2">
                <Progress value={c.effectiveness_score || 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
