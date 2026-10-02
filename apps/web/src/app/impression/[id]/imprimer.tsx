'use client';

export function BoutonImprimer() {
  return (
    <button className="btn plein" type="button" onClick={() => window.print()}>
      Imprimer ou enregistrer en PDF
    </button>
  );
}
