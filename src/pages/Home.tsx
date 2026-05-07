import { Bike, Building2, Car, Fish, Mountain, Trees } from 'lucide-react'
import { Link } from 'react-router-dom'

const mapCards = [
  {
    title: 'Trail Explorer',
    description:
      'Prince George and British Columbia hikes with route overlays, trail centers, source links, ratings, and filters.',
    status: 'Live',
    href: '/explorer',
    icon: Mountain,
    tint: 'bg-emerald-50 text-forest',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    stats: ['290 trails', '94 route maps', 'BC coverage'],
  },
  {
    title: 'Fish Stats',
    description:
      'BC fish stocking totals by region with species filters, proportional bubbles, and stocking leaderboard.',
    status: 'Live',
    href: '/fish',
    icon: Fish,
    tint: 'bg-cyan-50 text-water',
    image:
      'https://images.unsplash.com/photo-1688656116639-106f7bcd66d4?auto=format&fit=crop&w=1200&q=80',
    stats: ['4.94M fish', '673 lakes', '2025 review'],
  },
  {
    title: 'City Layers',
    description:
      'A civic map workspace for neighborhoods, parks, facilities, and local planning layers.',
    status: 'Planned',
    icon: Building2,
    tint: 'bg-sky-50 text-water',
    image:
      'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80',
    stats: ['Facilities', 'Parks', 'Boundaries'],
  },
  {
    title: 'Road Access',
    description:
      'Forest service roads, trailhead access, parking notes, and EV-friendly trip planning.',
    status: 'Planned',
    icon: Car,
    tint: 'bg-amber-50 text-sun',
    image:
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
    stats: ['Trailheads', 'Access notes', 'EV stops'],
  },
  {
    title: 'Recreation Map',
    description:
      'Camping, biking, snowshoeing, cabins, waterfalls, alpine lakes, and seasonal outdoor layers.',
    status: 'Planned',
    icon: Bike,
    tint: 'bg-slate-100 text-ink',
    image:
      'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1200&q=80',
    stats: ['Activities', 'Features', 'Seasons'],
  },
]

export function Home() {
  return (
    <main className="mx-auto min-h-[calc(100vh-56px)] max-w-7xl px-4 py-6 sm:px-6">
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-forest">Maps</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">Map library</h2>
          </div>
          <Trees className="size-6 text-forest" aria-hidden="true" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {mapCards.map((map) => {
            const Icon = map.icon
            const content = (
              <>
                <div className="relative h-36 overflow-hidden bg-field">
                  <img
                    alt=""
                    className="size-full object-cover transition duration-300 group-hover:scale-105"
                    src={map.image}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/55 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1 text-xs font-semibold text-ink">
                    {map.status}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-ink">
                        {map.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {map.description}
                      </p>
                    </div>
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-md ${map.tint}`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {map.stats.map((stat) => (
                      <span
                        className="rounded-full bg-field px-2.5 py-1 text-xs font-medium text-slate-600"
                        key={stat}
                      >
                        {stat}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )

            return map.href ? (
              <Link
                className="group overflow-hidden rounded-md border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel"
                key={map.title}
                to={map.href}
              >
                {content}
              </Link>
            ) : (
              <article
                className="group overflow-hidden rounded-md border border-line bg-white shadow-sm"
                key={map.title}
              >
                {content}
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}
