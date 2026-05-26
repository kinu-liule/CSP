import { Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import Policies from './pages/Policies'
import Controls from './pages/Controls'
import Risks from './pages/Risks'
import Compliance from './pages/Compliance'
import Audit from './pages/Audit'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/controls" element={<Controls />} />
        <Route path="/risks" element={<Risks />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/audit" element={<Audit />} />
      </Routes>
    </div>
  )
}

export default App
