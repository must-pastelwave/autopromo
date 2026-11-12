/** Back to the dashboard's Channels section with a one-line message. */
export const toChannels = (req: Request, msg: string) =>
  Response.redirect(new URL(`/?msg=${encodeURIComponent(msg)}#channels`, req.url), 302)
