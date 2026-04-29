import { ArrowRight, Database, Layers, MapPinned } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

const projectStats = [
  { label: 'Starter layers', value: '1' },
  { label: 'Data format', value: 'GeoJSON' },
  { label: 'Default area', value: 'Prince George' },
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
              Prince George explorer
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A static React map app with reusable map components, local data
              files, and a first explorer screen ready to extend.
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
            Files in public/data can be replaced with local GeoJSON, JSON, or
            CSV datasets.
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-5">
          <Layers className="size-5 text-sun" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Layer controls</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The explorer starts with a toggleable points layer and room for new
            map sections.
          </p>
        </div>
        <div className="min-h-[360px] rounded-md border border-line bg-[linear-gradient(135deg,#e7f1ef_0%,#f7faf9_45%,#dbe8ef_100%)] p-5 md:col-span-3">
          <div className="grid h-full place-items-center rounded-md border border-dashed border-slate-300 bg-white/55">
            <div className="max-w-md text-center">
              <p className="text-sm font-semibold text-forest">
                Next section slot
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Add future map modules under src/maps and expose them as routes
                when the data model is ready.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
