import { ArrowRight, Database, Layers, MapPinned } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

const projectStats = [
  { label: 'Trail posts', value: '118' },
  { label: 'Mapped routes', value: '94' },
  { label: 'Route distance', value: '1,735 km' },
]

export function Home() {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr]">
      <aside className="flex flex-col justify-between rounded-md border border-line bg-white p-5 shadow-panel">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase text-forest">
              Map workspace
            </p>
            <h1 className="mt-3 text-3xl font-bold text-ink">
              Prince George trail explorer
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Browse hiking.princegeorge.tech trail posts on an interactive map
              with route geometry, trail details, source links, and photos.
            </p>
          </div>
          <Link to="/explorer">
            <Button className="w-full">
              Open explorer
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
        <dl className="mt-8 grid gap-3">
          {projectStats.map((item) => (
            <div
              className="flex items-center justify-between border-t border-line pt-3 text-sm"
              key={item.label}
            >
              <dt className="text-slate-500">{item.label}</dt>
              <dd className="font-semibold text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="grid gap-4 md:grid-cols-3 lg:auto-rows-fr">
        <div className="rounded-md border border-line bg-white p-5">
          <MapPinned className="size-5 text-water" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Interactive map</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            MapLibre renders the base map and custom data layers without a
            backend.
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-5">
          <Database className="size-5 text-forest" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Static data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            WordPress trail posts are imported into JSON metadata and GeoJSON
            route overlays under public/data.
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-5">
          <Layers className="size-5 text-sun" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Layer controls</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Search, filter categories, toggle routes or trail points, and open
            the original trail posts.
          </p>
        </div>
        <div className="min-h-[360px] rounded-md border border-line bg-[linear-gradient(135deg,#e7f1ef_0%,#f7faf9_45%,#dbe8ef_100%)] p-5 md:col-span-3">
          <div className="grid h-full place-items-center rounded-md border border-dashed border-slate-300 bg-white/55">
            <div className="max-w-md text-center">
              <p className="text-sm font-semibold text-forest">
                Trail data pipeline
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Run npm run trails:sync to refresh the imported trail posts and
                Waymark route overlays from the source website.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
