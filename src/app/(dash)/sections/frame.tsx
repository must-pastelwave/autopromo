/** Page frame: title and an optional one-line message from the last action. */
export function Page({ title, msg, children }: { title: string; msg?: string; children: React.ReactNode }) {
  return (
    <>
      <h1>{title}</h1>
      {msg && <div className="notice" role="status">{msg}</div>}
      {children}
    </>
  )
}
