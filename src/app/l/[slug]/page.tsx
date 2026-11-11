import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function LinkInBio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [product] = await sql`select id, name, url from products where slug = ${slug}`
  if (!product) notFound()
  const posts = await sql`
    select p.id, p.topic, p.link_code from posts p join channels c on c.id = p.channel_id
    where p.product_id = ${product.id} and c.platform = 'instagram' and p.status = 'published'
    order by p.scheduled_for desc nulls last limit 12`
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>{product.name}</h1>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {posts.map(p => (
          <li key={p.id}>
            <a href={`/go/${p.link_code}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/slide/${p.id}/0`} alt={p.topic} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', borderRadius: 8 }} />
              <div style={{ fontSize: 13, marginTop: 4 }}>{p.topic}</div>
            </a>
          </li>
        ))}
      </ul>
      {posts.length === 0 && <p><a href={product.url}>{product.url}</a></p>}
    </main>
  )
}
