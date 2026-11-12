/** Back to the Channels page with a one-line message. */
export const toChannels = (req: Request, msg: string) =>
  Response.redirect(new URL(`/channels?msg=${encodeURIComponent(msg)}`, req.url), 302)
