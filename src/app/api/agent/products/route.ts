import { agentProducts } from '@/lib/pending'

export async function GET() {
  return Response.json({ products: await agentProducts() })
}
