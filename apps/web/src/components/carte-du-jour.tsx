'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { adresseComplete, geocoder, type Point } from '@chantio/shared';
import { useEffect, useRef, useState } from 'react';

export interface ArretCarte {
  id: string;
  heure: string;
  titre: string;
  detail: string;
  enCours: boolean;
  site: { adresse: string; code_postal: string | null; ville: string | null; latitude: number | null; longitude: number | null } | null;
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

/** Carte des interventions du jour : une pastille numérotée par chantier, reliées dans l'ordre des heures. */
export function CarteDuJour({ arrets, hauteur = 340 }: { arrets: ArretCarte[]; hauteur?: number }) {
  const zone = useRef<HTMLDivElement>(null);
  const [manquants, setManquants] = useState(0);

  useEffect(() => {
    let actif = true;
    let carte: import('maplibre-gl').Map | null = null;
    (async () => {
      const ml = await import('maplibre-gl');
      const points = await Promise.all(arrets.map((a) => positionSite(a.site)));
      if (!actif || !zone.current) return;
      const places = points.flatMap((p) => (p ? [[p.lon, p.lat] as [number, number]] : []));
      carte = new ml.Map({
        container: zone.current,
        style: STYLE_CARTE,
        center: places[0] ?? [2.3522, 48.8566],
        zoom: 11,
        scrollZoom: false,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      carte.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      const c = carte;

      c.on('load', () => {
        teinter(c);
        // Trajet de la journée, en pointillés cobalt, dans l'ordre des heures.
        if (places.length > 1) {
          c.addSource('trajet', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: places } } });
          c.addLayer({
            id: 'trajet',
            type: 'line',
            source: 'trajet',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#2F54EB', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [0.5, 2] },
          });
        }
      });

      arrets.forEach((a, n) => {
        const p = points[n];
        if (!p) return;
        const pastille = document.createElement('span');
        pastille.className = `pastille-carte${a.enCours ? ' en-cours' : ''}`;
        pastille.textContent = String(n + 1);
        pastille.title = a.titre;
        new ml.Marker({ element: pastille })
          .setLngLat([p.lon, p.lat])
          .setPopup(
            new ml.Popup({ offset: 22, closeButton: false, maxWidth: '260px' }).setHTML(
              `<a href="/interventions/${a.id}" class="bulle-carte"><b>${echapper(a.heure)} · ${echapper(a.titre)}</b><br>${echapper(a.detail)}</a>`,
            ),
          )
          .addTo(c);
      });
      setManquants(points.filter((p) => !p).length);
      if (places.length > 1) {
        const bornes = places.reduce((b, p) => b.extend(p), new ml.LngLatBounds(places[0], places[0]));
        c.fitBounds(bornes, { padding: 56, maxZoom: 15, duration: 0 });
      } else if (places.length === 1) c.setZoom(14);
    })();
    return () => {
      actif = false;
      carte?.remove();
    };
  }, [arrets]);

  return (
    <div className="relative isolate overflow-hidden">
      <div ref={zone} style={{ height: hauteur }} className="carte-fond w-full" aria-label="Carte des interventions du jour" />
      {manquants > 0 && (
        <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 px-3 py-2 text-sm text-gris shadow-sm">
          {manquants} adresse{manquants > 1 ? 's' : ''} introuvable{manquants > 1 ? 's' : ''} : vérifie la fiche client.
        </p>
      )}
    </div>
  );
}
