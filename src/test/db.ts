import { sql } from '@/lib/db'

export async function resetDb() {
  await sql`truncate clicks, posts, channels, products restart identity cascade`
}

export async function seed(o: { platform?: string; automatable?: boolean; account?: string | null } = {}) {
  const [p] = await sql`insert into products (slug, url, name, audience, fact_sheet)
    values ('l2u', 'https://l2u.co.kr/', 'L2U', '여행자', ${sql.json([{ fact: '회원 할인가 제공', source_url: 'https://l2u.co.kr/' }, { fact: '국내외 호텔 예약', source_url: 'https://l2u.co.kr/' }])})
    returning id`
  const [c] = await sql`insert into channels (product_id, platform, automatable, enabled, zernio_account_id)
    values (${p.id}, ${o.platform ?? 'threads'}, ${o.automatable ?? true}, true, ${o.account === undefined ? 'acc1' : o.account}) returning id`
  return { productId: p.id as number, channelId: c.id as number }
}

let n = 0
export async function insertPost(productId: number, channelId: number, extra: Record<string, unknown> = {}) {
  const row = {
    product_id: productId, channel_id: channelId, client_key: `k${++n}`, kind: 'text', caption: '삿포로 겨울 여행 팁',
    slides: sql.json([]), topic: 'sapporo', format_tag: 'tip', link_code: `code${String(n).padStart(4, '0')}`, status: 'passed',
    ...extra,
  }
  const [p] = await sql`insert into posts ${sql(row)} returning *`
  return p
}
