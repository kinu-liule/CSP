import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

const fetchDashboard = async () => {
  const res = await fetch('/api/dashboard', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['grc-dashboard'], queryFn: fetchDashboard })

  if (isLoading) return <div className="p-6">Loading GRC dashboard...</div>

  const stats = data?.data || {}

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">GRC Platform Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.policies || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.controls || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open Risks</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{stats.open_risks || 0}</div>
            <p className="text-sm text-muted-foreground mt-1">Avg Score: {stats.avg_risk?.toFixed(1) || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{stats.compliance_rate || 0}%</div>
            <Progress value={stats.compliance_rate || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Policy Governance</h2>
          <div className="space-y-2">
            <div className="flex justify-between p-2 border rounded">
              <span>Total Policies</span>
              <span className="font-bold">{stats.policies || 0}</span>
            </div>
            <div className="flex justify-between p-2 border rounded">
              <span>Active Controls</span>
              <span className="font-bold text-green-500">{stats.controls || 0}</span>
            </div>
            <div className="flex justify-between p-2 border rounded">
              <span>Compliance Score</span>
              <span className="font-bold">{stats.compliance_rate || 0}%</span>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Risk Management</h2>
          <div className="space-y-2">
            <div className="flex justify-between p-2 border rounded">
              <span>Total Risks</span>
              <span className="font-bold">{stats.risks || 0}</span>
            </div>
            <div className="flex justify-between p-2 border rounded">
              <span>Open Risks</span>
              <span className="font-bold text-red-500">{stats.open_risks || 0}</span>
            </div>
            <div className="flex justify-between p-2 border rounded">
              <span>Average Risk Score</span>
              <span className="font-bold">{stats.avg_risk?.toFixed(1) || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button variant="outline" className="h-20">Create Policy</Button>
          <Button variant="outline" className="h-20">Add Control</Button>
          <Button variant="outline" className="h-20">Assess Risk</Button>
          <Button variant="outline" className="h-20">Run Audit</Button>
        </div>
      </div>
    </div>
  )
}
