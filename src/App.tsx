import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { Home } from './pages/Home'

// Map pages pull in MapLibre, so load them only when visited.
const ExplorerSection = lazy(() =>
  import('./maps/explorer').then((module) => ({
    default: module.ExplorerSection,
  })),
)
const FishStatsSection = lazy(() =>
  import('./maps/fish').then((module) => ({
    default: module.FishStatsSection,
  })),
)

function PageFallback() {
  return (
    <div className="grid min-h-[calc(100dvh-56px)] place-items-center text-sm font-medium text-slate-600">
      Loading map
    </div>
  )
}

function App() {
  return (
    <Shell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explorer" element={<ExplorerSection />} />
          <Route path="/fish" element={<FishStatsSection />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}

export default App
