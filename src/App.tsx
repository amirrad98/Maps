import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { Home } from './pages/Home'
import { ExplorerSection } from './maps/explorer'
import { FishStatsSection } from './maps/fish'

function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explorer" element={<ExplorerSection />} />
        <Route path="/fish" element={<FishStatsSection />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}

export default App
