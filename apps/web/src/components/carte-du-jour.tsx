'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { adresseComplete, geocoder, type Point } from '@chantio/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { demarrerNavigation } from './barre-chargement';
import './accueil/accueil.css';

export interface ArretCarte {
  id: string;
  heure: string;
  titre: string;
  detail: string;
  enCours: boolean;
  site: { adresse: string; code_postal: string | null; ville: string | null; latitude: number | null; longitude: number | null } | null;
  /** Couleur du point : celle du premier technicien (gris sans technicien). */
  couleur?: string;
  /** Texte à côté du point : « 08:30 Karim ». */
  etiquette?: string;
  /** Terminée, validée ou facturée : point creux (blanc cerclé de la couleur). */
  fait?: boolean;
  /** Adresse ouverte au clic sur le point (le volet de l'intervention, par-dessus la page). */
  lien?: string;
}

/** Repère de l'entreprise sur la carte : petit carré sombre et son nom. */
export interface RepereEntreprise {
  nom: string;
  site: ArretCarte['site'];
}

/** Une entrée de la légende : un rond à la couleur du technicien et son prénom. */
export interface LegendeTechnicien {
  id: string;
  prenom: string;
  couleur: string;
}

// Fond « Positron » d'OpenFreeMap : carte claire et épurée, gratuite, sans compte ni clé,
// utilisable pour un service commercial (données © OpenStreetMap).
export const STYLE_CARTE = 'https://tiles.openfreemap.org/styles/positron';

// Teintes de la charte posées sur le fond : eau lavande, parcs à peine verts, sol bleuté.
const TEINTES: [RegExp, string, string][] = [
  [/^background$/, 'background-color', '#F7F8FD'],
  [/^water/, 'fill-color', '#DCE3FB'],
  [/^waterway/, 'line-color', '#C9D4FA'],
  [/^(park|landuse_park|landcover_wood|landcover_grass)/, 'fill-color', '#EAF4EE'],
];

export const echapper = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Pose les teintes de la charte sur le fond de carte (à appeler au chargement du style). */
export function teinter(c: import('maplibre-gl').Map) {
  for (const couche of c.getStyle().layers ?? []) {
    for (const [motif, propriete, couleur] of TEINTES) {
      if (motif.test(couche.id) && couche.type === propriete.split('-')[0]) {
        try {
          c.setPaintProperty(couche.id, propriete as 'fill-color', couleur);
        } catch {}
      }
    }
  }
}

/** Position d'un site : celle enregistrée, sinon l'adresse géocodée (gardée dans le navigateur). */
export async function positionSite(site: ArretCarte['site']): Promise<Point | null> {
  if (!site) return null;
  if (site.latitude != null && site.longitude != null) return { lat: site.latitude, lon: site.longitude };
  const adresse = adresseComplete(site);
  const cle = `chantio:geo:${adresse.toLowerCase()}`;
  try {
    const deja = localStorage.getItem(cle);
    if (deja) return JSON.parse(deja) as Point;
  } catch {}
  const p = await geocoder(adresse);
  try {
    if (p) localStorage.setItem(cle, JSON.stringify(p));
  } catch {}
  return p;
}

/** Rayon du point en pixels : l'étiquette commence juste après. */
const RAYON = 8;
const HAUTEUR_ETIQUETTE = 20;

/**
 * Deux interventions proches : les étiquettes se chevauchent. Chaque étiquette qui gêne une étiquette
 * déjà posée (ou un autre point) passe à gauche de son point, sinon monte ou descend d'un cran ;
 * le point reste à sa place. Refait après chaque zoom.
 */
function desencombrer(c: import('maplibre-gl').Map, poses: { marqueur: import('maplibre-gl').Marker; etiquette: HTMLElement; dy: number }[]) {
  const h = HAUTEUR_ETIQUETTE;
  const liste = poses.map((x) => ({ ...x, p: c.project(x.marqueur.getLngLat()) })).sort((a, b) => a.p.y + a.dy - (b.p.y + b.dy));
  // Les points eux-mêmes sont des obstacles pour les étiquettes.
  const prises = liste.map(({ p, dy }) => ({ x1: p.x - RAYON, x2: p.x + RAYON, y1: p.y + dy - RAYON, y2: p.y + dy + RAYON }));
  const { clientWidth: largeur, clientHeight: hauteur } = c.getContainer();
  // Une place libre : dans le cadre de la carte, sans toucher une étiquette déjà posée ni un autre point.
  const libre = (r: { x1: number; x2: number; y1: number; y2: number }) =>
    r.x1 >= 0 && r.x2 <= largeur && r.y1 >= 0 && r.y2 <= hauteur && !prises.some((o) => r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1);
  for (const { etiquette, dy, p } of liste) {
    const w = etiquette.offsetWidth;
    const y = p.y + dy;
    const gauche = -(w + 2 * RAYON + 8);
    const essais: [number, number][] = [[0, 0], [gauche, 0], [0, -h], [0, h], [gauche, -h], [gauche, h], [0, -2 * h], [0, 2 * h]];
    const boite = ([dx, ddy]: [number, number]) => ({ x1: p.x + RAYON + 4 + dx, x2: p.x + RAYON + 4 + dx + w, y1: y - h / 2 + ddy, y2: y + h / 2 + ddy });
    const choix = essais.find((e) => libre(boite(e))) ?? essais[0];
    etiquette.style.transform = choix[0] || choix[1] ? `translate(${choix[0]}px, ${choix[1]}px)` : '';
    prises.push(boite(choix));
  }
}

/**
 * Carte du jour, comme celle de l'Accueil du bac à sable : un point par intervention du jour à la couleur
 * de son premier technicien, avec son étiquette (« 08:30 Karim ») ; point creux quand elle est faite,
 * halo qui pulse quand elle est en cours ; le repère de l'entreprise ; un clic ouvre l'intervention.
 * Dessous, la légende : un rond par technicien et « Terminée ».
 */
export function CarteDuJour({
  arrets,
  entreprise,
  legende = [],
  className = 'h-[280px] menu:h-[340px]',
}: {
  arrets: ArretCarte[];
  entreprise?: RepereEntreprise | null;
  legende?: LegendeTechnicien[];
  /** Hauteur de la carte (classes Tailwind). */
  className?: string;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [manquants, setManquants] = useState(0);
  // Les données arrivent d'une page serveur rafraîchie chaque minute : la carte n'est refaite que si elles changent.
  const cle = JSON.stringify({ arrets, entreprise });

  useEffect(() => {
    const { arrets: liste, entreprise: ent } = JSON.parse(cle) as { arrets: ArretCarte[]; entreprise?: RepereEntreprise | null };
    let actif = true;
    let carte: import('maplibre-gl').Map | null = null;
    (async () => {
      const ml = await import('maplibre-gl');
      const [points, siege] = await Promise.all([Promise.all(liste.map((a) => positionSite(a.site))), ent ? positionSite(ent.site) : Promise.resolve(null)]);
      if (!actif || !zone.current) return;
      const places = [...points, siege].flatMap((p) => (p ? [[p.lon, p.lat] as [number, number]] : []));
      carte = new ml.Map({
        container: zone.current,
        style: STYLE_CARTE,
        center: places[0] ?? [2.3522, 48.8566],
        zoom: 12,
        scrollZoom: false,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      carte.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      const c = carte;
      c.on('load', () => teinter(c));

      // Le repère de l'entreprise, sous les points.
      if (ent && siege) {
        const repere = document.createElement('span');
        repere.className = 'repere-entreprise';
        repere.innerHTML = `<i aria-hidden="true"></i><b>${echapper(ent.nom)}</b>`;
        new ml.Marker({ element: repere, anchor: 'left', offset: [-9, 0] }).setLngLat([siege.lon, siege.lat]).addTo(c);
      }

      // Plusieurs interventions à la même adresse : les points suivants montent d'un cran, comme dans le bac.
      const vus = new Map<string, number>();
      const poses: { marqueur: import('maplibre-gl').Marker; etiquette: HTMLElement; dy: number }[] = [];
      liste.forEach((a, n) => {
        const p = points[n];
        if (!p) return;
        const k = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
        const rang = vus.get(k) ?? 0;
        vus.set(k, rang + 1);
        const point = document.createElement('button');
        point.type = 'button';
        point.className = `point-carte${a.fait ? ' fait' : ''}${a.enCours ? ' en-cours' : ''}`;
        point.style.setProperty('--c', a.couleur ?? '#2F54EB');
        point.setAttribute('aria-label', `${a.etiquette ?? a.heure} : ${a.titre}${a.detail ? `, ${a.detail}` : ''}`);
        point.title = [a.titre, a.detail].filter(Boolean).join(' · ');
        point.innerHTML = `<span class="point-rond" aria-hidden="true"></span><span class="point-etiquette" aria-hidden="true">${echapper(a.etiquette ?? a.heure)}</span>`;
        if (a.lien) {
          const lien = a.lien;
          point.addEventListener('click', (e) => {
            e.stopPropagation();
            demarrerNavigation(lien);
            router.push(lien, { scroll: false });
          });
        }
        const marqueur = new ml.Marker({ element: point, anchor: 'left', offset: [-RAYON, -rang * 20] }).setLngLat([p.lon, p.lat]).addTo(c);
        poses.push({ marqueur, etiquette: point.querySelector<HTMLElement>('.point-etiquette')!, dy: -rang * 20 });
      });
      setManquants(points.filter((p) => !p).length);
      if (places.length > 1) {
        const bornes = places.reduce((b, p) => b.extend(p), new ml.LngLatBounds(places[0], places[0]));
        // Marge à droite plus large : les étiquettes partent vers la droite des points.
        c.fitBounds(bornes, { padding: { top: 48, bottom: 36, left: 40, right: 150 }, maxZoom: 15, duration: 0 });
      } else if (places.length === 1) c.setZoom(14);
      desencombrer(c, poses);
      c.on('zoomend', () => desencombrer(c, poses));
    })();
    return () => {
      actif = false;
      carte?.remove();
    };
  }, [cle, router]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative isolate overflow-hidden rounded-[14px] border border-trait">
        <div ref={zone} className={`carte-fond w-full ${className}`} role="region" aria-label="Carte des interventions du jour" />
      </div>
      {/* Sous la carte plutôt que dessus : le message ne cache aucun point. */}
      {manquants > 0 && (
        <p className="-mt-1 text-[12.5px] text-gris">
          {manquants} adresse{manquants > 1 ? 's' : ''} introuvable{manquants > 1 ? 's' : ''} : vérifie la fiche client.
        </p>
      )}
      {legende.length > 0 && (
        <p className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-gris">
          {legende.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.couleur } as CSSProperties} />
              {t.prenom}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-full border border-lavande bg-white" />
            Terminée
          </span>
        </p>
      )}
    </div>
  );
}
