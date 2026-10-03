'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point } from '@chantio/shared';
import { useEffect, useRef, useState } from 'react';
import { echapper, positionSite, STYLE_CARTE, teinter, type ArretCarte } from './carte-du-jour';

export interface ArretEquipe {
  id: string;
  heure: string;
  titre: string;
  detail: string;
  /** fait (terminée ou validée), cours, retard, attribuer (sans technicien), prevu */
  etat: 'fait' | 'cours' | 'retard' | 'attribuer' | 'prevu';
  membres: string[];
  site: ArretCarte['site'];
}

export interface PersonneCarte {
  id: string;
  initiales: string;
  photo: string | null;
  nom: string;
  texte: string;
  retard: boolean;
  point: Point;
}

const COULEUR: Record<ArretEquipe['etat'], string> = {
  fait: '#12B76A',
  cours: '#2F54EB',
  retard: '#F79009',
  attribuer: '#D92D20',
  prevu: '#2F54EB',
};

/**
 * Carte de l'équipe en direct. Sans technicien choisi : une tête par position partagée et
 * un point par intervention du jour. Avec un technicien : sa position, ses interventions
 * numérotées dans l'ordre des heures et le trajet ; le reste s'efface.
 */
export function CarteEquipe({
  arrets,
  personnes,
  choisi,
  onChoisir,
  hauteur = 560,
}: {
  arrets: ArretEquipe[];
  personnes: PersonneCarte[];
  choisi: string | null;
  onChoisir: (id: string | null) => void;
  hauteur?: number;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const carte = useRef<import('maplibre-gl').Map | null>(null);
  const ml = useRef<typeof import('maplibre-gl') | null>(null);
  const marqueurs = useRef<import('maplibre-gl').Marker[]>([]);
  const [prete, setPrete] = useState(false);
  const [points, setPoints] = useState<Map<string, Point | null>>(new Map());
  const choisir = useRef(onChoisir);
  useEffect(() => {
    choisir.current = onChoisir;
  }, [onChoisir]);

  // Carte créée une seule fois.
  useEffect(() => {
    let actif = true;
    let suivi: ResizeObserver | null = null;
    (async () => {
      const lib = await import('maplibre-gl');
      if (!actif || !zone.current) return;
      ml.current = lib;
      const c = new lib.Map({
        container: zone.current,
        style: STYLE_CARTE,
        center: [2.2700, 48.8530],
        zoom: 12,
        scrollZoom: false,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      c.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      c.on('load', () => {
        teinter(c);
        c.addSource('trajet', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        c.addLayer({
          id: 'trajet',
          type: 'line',
          source: 'trajet',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2F54EB', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [0.5, 2] },
        });
        if (actif) setPrete(true);
      });
      carte.current = c;
      suivi = new ResizeObserver(() => c.resize());
      suivi.observe(zone.current);
    })();
    return () => {
      actif = false;
      suivi?.disconnect();
      carte.current?.remove();
      carte.current = null;
    };
  }, []);

  // Adresses des interventions (enregistrées, sinon géocodées et gardées dans le navigateur).
  const cleSites = arrets.map((a) => `${a.id}:${a.site?.adresse ?? ''}`).join('|');
  useEffect(() => {
    let actif = true;
    Promise.all(arrets.map(async (a) => [a.id, await positionSite(a.site)] as const)).then((r) => {
      if (actif) setPoints(new Map(r));
    });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleSites]);

  // Marqueurs, trajet et cadrage à chaque changement.
  useEffect(() => {
    const c = carte.current;
    const lib = ml.current;
    if (!prete || !c || !lib) return;
    // La colonne « journée » vient peut-être d'apparaître : la carte reprend sa vraie taille avant le cadrage.
    c.resize();
    marqueurs.current.forEach((m) => m.remove());
    marqueurs.current = [];
    const cadre: [number, number][] = [];

    const siens = choisi ? arrets.filter((a) => a.membres.includes(choisi)) : [];
    const autres = choisi ? arrets.filter((a) => !a.membres.includes(choisi)) : arrets;

    const ajouterArret = (a: ArretEquipe, numero: number | null, estompe: boolean) => {
      const p = points.get(a.id);
      if (!p) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `pastille-carte${numero ? '' : ' petite'}${estompe ? ' estompee' : ''}${a.etat === 'cours' ? ' active' : ''}`;
      el.style.background = COULEUR[a.etat];
      el.textContent = numero ? String(numero) : '';
      el.setAttribute('aria-label', `${a.heure} · ${a.titre}`);
      if (!numero && a.membres[0]) el.addEventListener('click', () => choisir.current(a.membres[0]));
      const m = new lib.Marker({ element: el })
        .setLngLat([p.lon, p.lat])
        .setPopup(
          new lib.Popup({ offset: numero ? 22 : 12, closeButton: false, maxWidth: '260px' }).setHTML(
            `<a href="/interventions/${a.id}" class="bulle-carte"><b>${echapper(a.heure)} · ${echapper(a.titre)}</b><br>${echapper(a.detail)}</a>`,
          ),
        )
        .addTo(c);
      if (numero || !estompe) cadre.push([p.lon, p.lat]);
      marqueurs.current.push(m);
    };

    autres.forEach((a) => ajouterArret(a, null, !!choisi));
    siens.forEach((a, n) => ajouterArret(a, n + 1, false));

    // Deux personnes au même endroit (même chantier) : légèrement décalées pour que les deux têtes se voient.
    const places: Point[] = [];
    for (const pers of personnes) {
      const proches = places.filter((q) => Math.abs(q.lat - pers.point.lat) < 0.0004 && Math.abs(q.lon - pers.point.lon) < 0.0006).length;
      const point = { lat: pers.point.lat, lon: pers.point.lon + proches * 0.0007 };
      places.push(pers.point);
      const estompe = !!choisi && pers.id !== choisi;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `tete-carte${estompe ? ' estompee' : ''}${pers.retard ? ' retard' : ''}`;
      el.setAttribute('aria-label', `Voir la journée de ${pers.nom}`);
      el.title = `${pers.nom} · ${pers.texte}`;
      el.innerHTML = pers.photo
        ? `<img src="${echapper(pers.photo)}" alt="">`
        : `<span>${echapper(pers.initiales)}</span>`;
      el.addEventListener('click', () => choisir.current(pers.id));
      const m = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([point.lon, point.lat]).addTo(c);
      if (!estompe) cadre.push([point.lon, point.lat]);
      marqueurs.current.push(m);
    }

    const trajet = siens.flatMap((a) => {
      const p = points.get(a.id);
      return p ? [[p.lon, p.lat] as [number, number]] : [];
    });
    (c.getSource('trajet') as import('maplibre-gl').GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: trajet.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trajet } }] : [],
    });

    if (cadre.length > 1) {
      const bornes = cadre.reduce((b, p) => b.extend(p), new lib.LngLatBounds(cadre[0], cadre[0]));
      c.fitBounds(bornes, { padding: 64, maxZoom: 15, duration: 600 });
    } else if (cadre.length === 1) c.easeTo({ center: cadre[0], zoom: 14, duration: 600 });
  }, [prete, points, arrets, personnes, choisi]);

  const manquants = arrets.filter((a) => points.size && !points.get(a.id)).length;
  return (
    <div className="relative isolate h-full overflow-hidden">
      <div ref={zone} style={{ minHeight: hauteur }} className="carte-fond h-full w-full" aria-label="Carte de l’équipe" />
      {manquants > 0 && (
        <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 px-3 py-2 text-sm text-gris shadow-sm">
          {manquants} adresse{manquants > 1 ? 's' : ''} introuvable{manquants > 1 ? 's' : ''} : vérifie la fiche client.
        </p>
      )}
    </div>
  );
}
