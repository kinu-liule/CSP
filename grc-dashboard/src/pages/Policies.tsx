import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Policy } from '@/types'

const fetchPolicies = async (): Promise<Policy[]> => {
  const res = await fetch('/api/policies', { headers: { 'x-tenant-id': 'tenant1' } })
  return res.json()
}

export default function Policies() {
  const { data: policies = [], isLoading } = useQuery({ queryKey: ['policies'], queryFn: fetchPolicies })

  if (isLoading) return <div className="p-6">Loading policies...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Policies</h1>
        <Button>+ Create Policy</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Policies</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{policies.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-500">
            {policies.filter(p => p.status === 'active').length}
          </div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Draft</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-yellow-500">
            {policies.filter(p => p.status === 'draft').length}
          </div></CardContent>
        </Card>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Policy Library</h2>
        <div className="space-y-2">
          {policies.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 border rounded hover:bg-muted/50">
              <div>
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline" className="ml-2">{p.framework}</Badge>
              </div>
              <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge>
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No policies yet. Create your first policy to start GRC management.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
