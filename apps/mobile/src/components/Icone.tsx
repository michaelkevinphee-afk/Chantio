import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { c } from '@/lib/theme';

// Icônes au trait (même dessin que la maquette).
type Forme = { d: string } | { cercle: [number, number, number] } | { rect: [number, number, number, number, number] };

const ICONES = {
  plus: [{ d: 'M12 5v14M5 12h14' }],
  moins: [{ d: 'M5 12h14' }],
  droite: [{ d: 'm9 18 6-6-6-6' }],
  gauche: [{ d: 'm15 18-6-6 6-6' }],
  x: [{ d: 'M18 6 6 18M6 6l12 12' }],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  envoyer: [{ d: 'm22 2-7 20-4-9-9-4Z' }, { d: 'M22 2 11 13' }],
  aller: [{ d: 'M3 11l19-9-9 19-2-8-8-2z' }],
  telephone: [
    {
      d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    },
  ],
  photo: [{ d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }, { cercle: [12, 13, 3] }],
  galerie: [{ rect: [3, 3, 18, 18, 2] }, { cercle: [9, 9, 2] }, { d: 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21' }],
  horloge: [{ cercle: [12, 12, 10] }, { d: 'M12 6v6l4 2' }],
  cle: [{ cercle: [7.5, 15.5, 5.5] }, { d: 'm21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3' }],
  info: [{ cercle: [12, 12, 10] }, { d: 'M12 16v-4M12 8h.01' }],
  alerte: [{ d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }, { d: 'M12 9v4M12 17h.01' }],
  horsLigne: [
    { d: 'M2 2l20 20' },
    { d: 'M8.5 16.5a5 5 0 0 1 7 0' },
    { d: 'M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2-1.5M2 8.82a15 15 0 0 1 4.17-2.65M22 8.82a15 15 0 0 0-11.29-3.76' },
    { d: 'M12 20h.01' },
  ],
  nuage: [{ d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }, { d: 'M12 12v5M9.5 14.5 12 12l2.5 2.5' }],
  cle_molette: [
    { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  ],
  boite: [
    { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
    { d: 'M3.3 7 12 12l8.7-5M12 22V12' },
  ],
  refaire: [{ d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }, { d: 'M3 3v5h5' }],
  fichier: [{ d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }, { d: 'M14 2v6h6M8 13h8M8 17h5' }],
  goutte: [{ d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' }],
  flamme: [
    { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z' },
  ],
  jauge: [{ d: 'm12 14 4-4' }, { d: 'M3.34 19a10 10 0 1 1 17.32 0' }],
  couches: [{ d: 'm12 2 10 5-10 5L2 7z' }, { d: 'm2 17 10 5 10-5M2 12l10 5 10-5' }],
  micro: [{ rect: [9, 2, 6, 12, 3] }, { d: 'M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8' }],
  personne: [{ d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }, { cercle: [12, 7, 4] }],
  repere: [{ d: 'M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0' }, { cercle: [12, 10, 3] }],
  sortie: [{ d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }],
} satisfies Record<string, Forme[]>;

export type NomIcone = keyof typeof ICONES;

export function Icone({ nom, taille = 24, couleur = c.encre, epaisseur = 2.3 }: {
  nom: NomIcone;
  taille?: number;
  couleur?: string;
  epaisseur?: number;
}) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round">
      {(ICONES[nom] as Forme[]).map((f, i) =>
        'd' in f ? (
          <Path key={i} d={f.d} />
        ) : 'cercle' in f ? (
          <Circle key={i} cx={f.cercle[0]} cy={f.cercle[1]} r={f.cercle[2]} />
        ) : (
          <Rect key={i} x={f.rect[0]} y={f.rect[1]} width={f.rect[2]} height={f.rect[3]} rx={f.rect[4]} />
        ),
      )}
    </Svg>
  );
}
