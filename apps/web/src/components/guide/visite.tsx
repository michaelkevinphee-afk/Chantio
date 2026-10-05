'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { terminerMission } from '@/app/actions-premiers-pas';
import { mission, type Cible, type IdMission } from '@/lib/premiers-pas';

// Visite guidée par-dessus le vrai Chantio : le bouton à cliquer clignote, une bulle dit quoi faire,
// et l'on passe au geste suivant quand l'utilisateur a cliqué (ou choisi, ou appuyé sur « C'est fait »).
// La visite survit aux changements de page (sessionStorage). On la lance de partout avec lancerVisite().

const CLE = 'chantio-visite';
const EVENEMENT = 'chantio-visite';

/** Lance la visite guidée d'une mission (missions de l'Accueil, assistant de la bulle, page Aide). */
export function lancerVisite(id: IdMission) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: id }));
}

type Etat = { id: IdMission; i: number } | null;

function lire(): Etat {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLE) ?? 'null') as Etat;
    return v && mission(v.id)?.gestes ? v : null;
  } catch {
    return null;
  }
}
function ecrire(e: Etat) {
  try {
    if (e) sessionStorage.setItem(CLE, JSON.stringify(e));
    else sessionStorage.removeItem(CLE);
  } catch {}
}

const propre = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();
const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** La cible visible ; si une fenêtre est ouverte, seulement dedans (le reste de la page est inactif). */
function trouver(c: Cible): HTMLElement | null {
  const fenetre = document.querySelector('dialog:modal');
  const racine: ParentNode = fenetre ?? document;
  for (const el of racine.querySelectorAll<HTMLElement>(c.sel)) {
    if (el.closest('[data-visite]') || !visible(el)) continue;
    if (c.texte) {
      const t = propre(el.textContent);
      if (c.debut ? !t.startsWith(c.texte) : t !== c.texte) continue;
    }
    return el;
  }
  return null;
}

type Place = { top: number; left: number; fleche: number; dessus: boolean };

export function VisiteGuidee() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>(null);
  const [cible, setCible] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [bravo, setBravo] = useState<string | null>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const deja = useRef<HTMLElement | null>(null);

  const m = etat ? mission(etat.id) : undefined;
  const geste = etat && m?.gestes ? m.gestes[etat.i] : undefined;

  const changer = useCallback((e: Etat) => {
    ecrire(e);
    setEtat(e);
  }, []);

  // Reprise après un rechargement, et lancement depuis n'importe quel bouton « Montre-moi ».
  useEffect(() => {
    // Lu après le premier affichage : sessionStorage n'existe pas côté serveur.
    queueMicrotask(() => setEtat(lire()));
    const lancer = (ev: Event) => {
      const id = (ev as CustomEvent<IdMission>).detail;
      const m = mission(id);
      if (!m?.gestes) return;
      changer({ id, i: 0 });
      if (m.depart && location.pathname !== m.depart) router.push(m.depart);
    };
    window.addEventListener(EVENEMENT, lancer);
    return () => window.removeEventListener(EVENEMENT, lancer);
  }, [changer, router]);

  const suivant = useCallback(() => {
    if (!etat || !m?.gestes) return;
    if (etat.i + 1 < m.gestes.length) return changer({ id: etat.id, i: etat.i + 1 });
    changer(null);
    setBravo(m.bravo);
    void terminerMission(m.id).then(() => router.refresh());
    setTimeout(() => setBravo(null), 5000);
  }, [etat, m, changer, router]);

  // Cherche la cible du geste (elle peut arriver après un changement de page ou l'ouverture d'une fenêtre).
  useEffect(() => {
    if (!geste) return;
    const chercher = () => {
      const el = trouver(geste.cible);
      setCible((avant) => (avant === el ? avant : el));
    };
    chercher();
    const t = setInterval(chercher, 300);
    return () => clearInterval(t);
  }, [geste]);

  // La cible du geste en cours (aucune quand la visite est finie ou quittée).
  const actif = geste ? cible : null;

  // Fait clignoter la cible et la ramène à l'écran une fois par geste.
  useEffect(() => {
    if (!actif) return;
    actif.classList.add('guide-cible');
    if (deja.current !== actif) {
      deja.current = actif;
      actif.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return () => actif.classList.remove('guide-cible');
  }, [actif]);

  // Avance quand l'utilisateur fait le geste sur la cible.
  useEffect(() => {
    if (!actif || !geste || geste.action === 'fait') return;
    const type = geste.action === 'choix' ? 'change' : 'click';
    const ecoute = (e: Event) => {
      if (e.target instanceof Node && actif.contains(e.target)) setTimeout(suivant, 0);
    };
    document.addEventListener(type, ecoute, true);
    return () => document.removeEventListener(type, ecoute, true);
  }, [actif, geste, suivant]);

  // Place la bulle sous la cible (au-dessus s'il n'y a pas la place), et la suit au défilement.
  useEffect(() => {
    if (!actif) return;
    let image = 0;
    let avant = '';
    const placer = () => {
      const r = actif.getBoundingClientRect();
      // Dans une fenêtre, la bulle reste dans son cadre (elle y serait coupée) ; sinon dans l'écran.
      const f = actif.closest('dialog')?.getBoundingClientRect() ?? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
      const b = bulle.current;
      const l = b?.offsetWidth ?? 320;
      const h = b?.offsetHeight ?? 140;
      const dessus = r.bottom + 14 + h > f.bottom - 8 && r.top - 14 - h > f.top + 8;
      const top = Math.round(dessus ? r.top - 14 - h : Math.min(r.bottom + 14, f.bottom - h - 8));
      const centre = r.left + r.width / 2;
      const left = Math.round(Math.min(Math.max(centre - 40, f.left + 12), f.right - l - 12));
      const p = { top, left, fleche: Math.round(Math.min(Math.max(centre - left - 8, 18), l - 34)), dessus };
      const cle = JSON.stringify(p);
      if (cle !== avant) {
        avant = cle;
        setPlace(p);
      }
      image = requestAnimationFrame(placer);
    };
    placer();
    return () => cancelAnimationFrame(image);
  }, [actif]);

  // Une bulle posée en position fixe dans une fenêtre <dialog> se décale avec elle : on corrige l'écart.
  useEffect(() => {
    const b = bulle.current;
    if (!b || !place) return;
    b.style.translate = '';
    const r = b.getBoundingClientRect();
    const dx = place.left - r.left;
    const dy = place.top - r.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) b.style.translate = `${dx}px ${dy}px`;
  }, [place]);

  if (bravo)
    return (
      <div data-visite role="status" className="guide-bravo fixed inset-x-0 bottom-28 z-[80] mx-auto w-fit max-w-[calc(100%-32px)] rounded-[18px] bg-encre px-6 py-4 text-center text-white shadow-[0_20px_50px_-15px_rgb(16_26_61/0.6)]">
        <p className="text-lg font-extrabold">Mission réussie !</p>
        <p className="text-[15px] opacity-85">{bravo}</p>
      </div>
    );
  if (!etat || !m?.gestes || !geste) return null;

  const total = m.gestes.length;
  const quitter = () => changer(null);
  const contenu = (
    <div
      ref={bulle}
      data-visite
      role="dialog"
      aria-live="polite"
      aria-label={`Mission : ${m.titre}`}
      style={actif && place ? { top: place.top, left: place.left } : undefined}
      className={`fixed z-[90] w-[min(330px,calc(100vw-24px))] rounded-[18px] border-2 border-cobalt bg-white p-4 text-encre shadow-[0_20px_45px_-15px_rgb(16_26_61/0.5)] ${
        actif && place ? '' : 'bottom-5 left-5 max-menu:bottom-[calc(150px+env(safe-area-inset-bottom))] max-menu:left-3'
      }`}
    >
      {actif && place && (
        <span
          aria-hidden="true"
          style={{ left: place.fleche }}
          className={`absolute h-3.5 w-3.5 rotate-45 border-cobalt bg-white ${place.dessus ? '-bottom-[9px] border-r-2 border-b-2' : '-top-[9px] border-t-2 border-l-2'}`}
        />
      )}
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-extrabold tracking-[0.06em] text-cobalt uppercase">
          Geste {etat.i + 1} sur {total}
        </p>
        <button type="button" onClick={quitter} className="text-[13px] font-bold text-gris hover:text-encre">
          Quitter
        </button>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-doux">
        <div className="h-full rounded-full bg-cobalt transition-[width]" style={{ width: `${(etat.i / total) * 100}%` }} />
      </div>
      <p className="text-[15.5px] leading-snug">{geste.texte}</p>
      {!actif && (
        <p className="mt-2 text-[13.5px] text-gris">
          Je ne trouve pas ce bouton sur cette page.{' '}
          <button type="button" className="font-bold text-cobalt underline" onClick={() => (changer({ id: etat.id, i: 0 }), router.push('/'))}>
            Recommencer depuis l’Accueil
          </button>
        </p>
      )}
      {actif && geste.action === 'fait' && (
        <button type="button" onClick={suivant} className="degrade mt-3 rounded-[12px] px-4 py-2 text-[15px] font-bold text-white">
          C’est fait
        </button>
      )}
    </div>
  );
  // Dans une fenêtre ouverte, la bulle doit être dedans : le reste de la page est inactif.
  const fenetre = actif?.closest('dialog');
  return createPortal(contenu, fenetre ?? document.body);
}
