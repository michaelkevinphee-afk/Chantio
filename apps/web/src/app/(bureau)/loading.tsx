// Affiché tout de suite au clic, le temps que la page arrive.
export default function Chargement() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="h-10 w-64 rounded-lg bg-black/10" />
      <div className="h-4 w-40 rounded bg-black/10" />
      <div className="h-48 rounded-2xl bg-black/5" />
      <div className="h-48 rounded-2xl bg-black/5" />
    </div>
  );
}
