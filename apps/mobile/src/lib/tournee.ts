// Tournée du jour : place les interventions sur la carte et propose un ordre
// de passage qui fait rouler moins. Les adresses sont géocodées une seule fois
// puis gardées sur le téléphone.
import { adresseComplete, geocoder, longueurTrajet, ordreConseille, type Point } from '@chantio/shared';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';

import type { InterventionVue } from './donnees';
import { ecrire, lire } from './stockage';

export interface Etape {
  intervention: InterventionVue;
  point: Point;
  /** 1, 2, 3… dans l'ordre conseillé. */
  rang: number;
}

const cleGeo = (adresse: string) => `chantio:geo:${adresse.toLowerCase()}`;

/** Position d'une intervention : celle du site si le bureau l'a, sinon l'adresse géocodée. */
async function positionDe(i: InterventionVue): Promise<Point | null> {
  const s = i.site;
  if (!s) return null;
  if (s.latitude != null && s.longitude != null) return { lat: s.latitude, lon: s.longitude };
  const adresse = adresseComplete(s);
  const deja = await lire<Point>(cleGeo(adresse));
  if (deja) return deja;
  const p = await geocoder(adresse);
  if (p) await ecrire(cleGeo(adresse), p).catch(() => {});
  return p;
}

/** Dernière position connue du téléphone, si le technicien l'a autorisée. */
async function maPosition(): Promise<Point | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const p =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return p ? { lat: p.coords.latitude, lon: p.coords.longitude } : null;
  } catch {
    return null;
  }
}

/**
 * `optimiser` : ordre le plus court en partant de la position du téléphone
 * (le chantier en cours reste en tête, sinon le premier rendez-vous si la
 * position n'est pas connue). Sinon, l'ordre des heures.
 */
export function useTournee(liste: InterventionVue[], optimiser: boolean) {
  const [points, setPoints] = useState<Map<string, Point | null>>(new Map());
  const [depart, setDepart] = useState<Point | null>(null);
  const [chargement, setChargement] = useState(true);
  const cle = liste.map((i) => i.id).join(',');

  useEffect(() => {
    let actif = true;
    setChargement(true);
    Promise.all([Promise.all(liste.map(async (i) => [i.id, await positionDe(i)] as const)), maPosition()]).then(([res, ici]) => {
      if (!actif) return;
      setPoints(new Map(res));
      setDepart(ici);
      setChargement(false);
    });
    return () => {
      actif = false;
    };
    // La liste change de référence à chaque rafraîchissement : on suit ses identifiants.
  }, [cle]);

  return useMemo(() => {
    const placees = liste.filter((i) => points.get(i.id));
    const introuvables = chargement ? [] : liste.filter((i) => !points.get(i.id));
    const pts = placees.map((i) => points.get(i.id)!);
    const enCours = placees.findIndex((i) => i.statut === 'en_cours');
    // Sans la position du téléphone, on part du premier rendez-vous de la journée.
    const premier = enCours >= 0 ? enCours : depart ? undefined : 0;
    const ordre = optimiser ? ordreConseille(pts, depart, premier) : pts.map((_, n) => n);
    const etapes: Etape[] = ordre.map((n, r) => ({ intervention: placees[n], point: pts[n], rang: r + 1 }));
    const km = longueurTrajet(pts, ordre, depart);
    const kmHoraire = longueurTrajet(pts, pts.map((_, n) => n), depart);
    return { etapes, introuvables, depart, chargement, km, gainKm: Math.max(0, kmHoraire - km) };
  }, [liste, points, depart, chargement, optimiser]);
}
