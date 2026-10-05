import type { SVGProps } from 'react';

// Pictos des écrans Achats, repris du bac à sable (I_ACH et HORLOGE) : document, fournisseur, lien,
// historique, paiement, virement, fichier, éclair (collecte automatique), photo, commentaire, horloge.
const ELEMENTS = {
  doc: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </>
  ),
  four: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
    </>
  ),
  lien: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  histo: <path d="M4 6h1M4 12h1M4 18h1M9 6h11M9 12h11M9 18h11" />,
  paie: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19M16 15h2" />
    </>
  ),
  vir: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  poub: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  fic: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
    </>
  ),
  eclair: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  photo: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  com: <path d="M4 5h16v11H9l-5 4z" />,
  horloge: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M5 3 2 6M19 3l3 3" />
    </>
  ),
} as const;

export type NomIconeAchat = keyof typeof ELEMENTS;

export function IconeAchat({ nom, taille = 20, ...props }: { nom: NomIconeAchat; taille?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {ELEMENTS[nom]}
    </svg>
  );
}
