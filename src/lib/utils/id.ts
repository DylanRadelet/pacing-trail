/** Identifiant court. crypto.randomUUID n'existe pas hors HTTPS (ex. téléphone via l'IP du PC). */
export function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
