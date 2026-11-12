import { workToDo } from '@/lib/pending'

/** For the workflow's "auto" mode: which agents to run now. */
export async function GET() {
  return Response.json(await workToDo())
}
