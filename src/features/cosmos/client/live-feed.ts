const DEFAULT_TIMEOUT_MS = 15_000;

/** A cancellable request with a bounded wait and a user-facing JSON error. */
export async function requestCosmosJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  init.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error.slice(0, 500)
          : "Le service ne répond pas. Réessayez dans quelques instants.";
      throw new Error(message);
    }
    if (body === null) throw new Error("Le service a envoyé une réponse illisible. Réessayez.");
    return body;
  } catch (error) {
    if (timedOut)
      throw new Error(
        "Le service met trop de temps à répondre. Vos données saisies sont conservées.",
      );
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (error instanceof TypeError)
      throw new Error("Connexion interrompue. Vérifiez votre accès à Internet puis réessayez.");
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", cancel);
  }
}
