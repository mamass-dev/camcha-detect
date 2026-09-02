/** SHA-256 via Web Crypto : fonctionne dans le middleware (edge) comme côté Node. */
export async function jetonSession(): Promise<string> {
  const data = new TextEncoder().encode(`camcha:${process.env.APP_PASSWORD ?? ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
