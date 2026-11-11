import postgres from 'postgres'

export const sql = postgres(process.env.DATABASE_URL ?? 'postgres://localhost/autopromo', {
  // Vercel functions are short-lived; keep the pool small.
  max: 3,
})
