import { agentProducts } from '@/lib/pending'
import { goalsWithProgress } from '@/lib/goals'

export async function GET() {
  const products = await agentProducts()
  return Response.json({ products: await Promise.all(products.map(async p => ({ ...p, goals: await goalsWithProgress(p.id) }))) })
}
