'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { envoyerRetour } from '@/app/actions-retours';
import { Icone } from './icones';
import { Roue } from './retour';

// Bulle « Vos idées pour Chantio », en bas à droite comme celle de Kolecto : l'utilisateur dicte
// ou écrit ce qu'il voudrait améliorer, et le retour part avec la page exacte où il se trouve.

/** Ce que l'écran affiche : titre de la page, onglet ou rubrique choisi, volet ou fenêtre ouverts. */
function lirePage() {
  const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const morceaux = [
    texte(document.querySelector('[data-contenu] h1')),
    texte(document.querySelector('[data-contenu] [role="tab"][aria-selected="true"], [data-contenu] [aria-current="page"]')),
    texte(document.querySelector('[role="dialog"] h2')),
    texte(document.querySelector('dialog[open] h2, dialog[open] h3')),
  ].filter((m, i, t) => m && t.indexOf(m) === i);
  return {
    page: location.pathname + location.search + location.hash,
    titrePage: morceaux.join(' › ') || document.title.replace(/ · Chantio$/, ''),
  };
}

function lireAppareil() {
  const l = window.innerWidth;
  return `${l < 821 ? 'téléphone' : 'ordinateur'} ${l}×${window.innerHeight} · ${navigator.userAgent}`.slice(0, 300);
}

// Dictée du navigateur (Chrome, Edge, Safari) : pas de type fourni par TypeScript.
interface Reconnaissance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
function nouvelleReconnaissance(): Reconnaissance | null {
  const w = window as unknown as Record<string, (new () => Reconnaissance) | undefined>;
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return R ? new R() : null;
}

type Message = { de: 'chantio' | 'moi'; texte: string; page?: string };

export function BulleRetours({ prenom }: { prenom: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [lieu, setLieu] = useState({ page: '', titrePage: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [ecoute, setEcoute] = useState(false);
  const [aideClavier, setAideClavier] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const fil = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const recherche = useSearchParams().toString();

  // Page relue à l'ouverture et à chaque changement d'adresse (le volet ou l'onglet s'affiche juste après).
  useEffect(() => {
    if (!ouvert) return;
    const lire = () => setLieu(lirePage());
    const a = requestAnimationFrame(lire);
    const t = setTimeout(lire, 400);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
  }, [ouvert, pathname, recherche]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ouvert]);

  useEffect(() => () => reco.current?.stop(), []);

  const arreter = () => {
    reco.current?.stop();
    reco.current = null;
    setEcoute(false);
  };

  const dicter = () => {
    if (ecoute) return arreter();
    setErreur('');
    const r = nouvelleReconnaissance();
    if (!r) {
      // Navigateur sans dictée : celle du clavier (micro de l'iPhone ou d'Android, dictée du Mac).
      setAideClavier(true);
      champ.current?.focus();
      return;
    }
    const debut = texte.trim();
    let acquis = '';
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let provisoire = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const morceau = e.results[i][0].transcript;
        if (e.results[i].isFinal) acquis += morceau;
        else provisoire += morceau;
      }
      setTexte([debut, (acquis + provisoire).trim()].filter(Boolean).join(' '));
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErreur('Autorisez le micro pour ce site, ou écrivez votre message.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setErreur('La dictée s’est arrêtée. Réessayez ou écrivez votre message.');
    };
    r.onend = () => {
      reco.current = null;
      setEcoute(false);
    };
    reco.current = r;
    try {
      r.start();
      setEcoute(true);
    } catch {
      setAideClavier(true);
      champ.current?.focus();
    }
  };

  const envoyer = async () => {
    const message = texte.trim();
    if (!message || envoi) return;
    arreter();
    setEnvoi(true);
    setErreur('');
    const l = lirePage();
    const r = await envoyerRetour({ texte: message, page: l.page, titrePage: l.titrePage, appareil: lireAppareil() }).catch(() => ({
      ok: false as const,
      erreur: 'Le message n’est pas parti. Vérifiez la connexion et réessayez.',
    }));
    setEnvoi(false);
    if (!r.ok) return setErreur(r.erreur);
    setTexte('');
    setAideClavier(false);
    setMessages((m) => [
      ...m,
      { de: 'moi', texte: message, page: l.titrePage || l.page },
      { de: 'chantio', texte: `Merci ${prenom}, c’est noté ! Vous pouvez en envoyer un autre, ici ou depuis une autre page.` },
    ]);
  };

  return (
    <>
      {ouvert && (
        <section
          aria-label="Vos idées pour Chantio"
          className="retours-entree fixed right-5 bottom-[92px] z-[55] flex max-h-[min(640px,calc(100dvh-120px))] w-[392px] flex-col overflow-hidden rounded-[24px] border border-trait bg-white shadow-[0_30px_70px_-25px_rgb(16_26_61/0.45)] max-menu:inset-x-3 max-menu:bottom-[calc(148px+env(safe-area-inset-bottom))] max-menu:w-auto max-menu:max-h-[calc(100dvh-200px)]"
        >
          <header className="flex items-center gap-3 border-b border-trait px-4 py-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-encre">
              <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true">
                <rect x="14" y="14" width="24" height="68" rx="10" fill="#FFFFFF" />
                <rect x="44" y="14" width="38" height="24" rx="10" fill="#FFFFFF" fillOpacity="0.75" />
                <rect x="44" y="58" width="38" height="24" rx="10" fill="#FFFFFF" fillOpacity="0.5" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold leading-tight">Vos idées pour Chantio</p>
              <p className="text-[13px] text-gris">Chaque message est lu par l’équipe</p>
            </div>
            <button
              type="button"
              onClick={() => {
                arreter();
                setOuvert(false);
              }}
              aria-label="Fermer"
              className="grid h-9 w-9 place-items-center rounded-full text-gris transition hover:bg-fond hover:text-encre"
            >
              <Icone nom="fermer" taille={18} />
            </button>
          </header>

          <div ref={fil} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="max-w-[92%] rounded-[18px] rounded-tl-[6px] bg-fond px-4 py-3 text-[15px] leading-relaxed">
              <p>Bonjour {prenom},</p>
              <p className="mt-2">
                Dites-nous ce que vous aimeriez <strong>améliorer</strong> : un bouton mal placé, une info qui manque, une idée…
              </p>
              <p className="mt-2">
                Appuyez sur <strong>Dicter</strong> et parlez, puis sur la flèche pour envoyer. La page où vous êtes part avec votre message.
              </p>
            </div>
            {messages.map((m, i) =>
              m.de === 'moi' ? (
                <div key={i} className="ml-auto max-w-[88%]">
                  <p className="rounded-[18px] rounded-tr-[6px] bg-cobalt px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white">{m.texte}</p>
                  <p className="mt-1 text-right text-xs text-gris">Envoyé · {m.page}</p>
                </div>
              ) : (
                <p key={i} className="max-w-[92%] rounded-[18px] rounded-tl-[6px] bg-fond px-4 py-3 text-[15px] leading-relaxed">
                  {m.texte}
                </p>
              ),
            )}
          </div>

          <div className="border-t border-trait px-4 pt-3 pb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] text-gris" title={lieu.page}>
              <Icone nom="lieu" taille={14} className="shrink-0" />
              <span className="truncate">
                Page : <strong className="text-encre">{lieu.titrePage || lieu.page}</strong>
              </span>
            </p>
            <div className={`rounded-[18px] border bg-white transition ${ecoute ? 'border-cobalt ring-4 ring-cobalt/15' : 'border-trait focus-within:border-cobalt'}`}>
              <textarea
                ref={champ}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void envoyer();
                  }
                }}
                rows={3}
                maxLength={5000}
                placeholder={ecoute ? 'Je vous écoute…' : 'Écrivez ou dictez votre idée…'}
                aria-label="Votre message"
                className="block max-h-40 w-full resize-none rounded-t-[18px] bg-transparent px-4 pt-3 text-[15px] outline-none"
              />
              <div className="flex items-center gap-2 px-2.5 pb-2.5">
                <button
                  type="button"
                  onClick={dicter}
                  aria-pressed={ecoute}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition ${
                    ecoute ? 'bg-rouge text-white' : 'bg-doux text-cobalt hover:bg-bleu-doux'
                  }`}
                >
                  {ecoute ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> : <Icone nom="micro" taille={18} />}
                  {ecoute ? 'Arrêter' : 'Dicter'}
                </button>
                <button
                  type="button"
                  onClick={() => void envoyer()}
                  disabled={!texte.trim() || envoi}
                  aria-label="Envoyer"
                  className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-cobalt text-white transition hover:bg-cobalt-vif disabled:bg-trait disabled:text-white"
                >
                  {envoi ? <Roue taille={18} /> : <Icone nom="envoyer" taille={20} />}
                </button>
              </div>
            </div>
            {aideClavier && !erreur && (
              <p className="mt-2 text-[13px] text-gris">Touchez le micro de votre clavier pour dicter (dictée de l’iPhone, d’Android ou du Mac).</p>
            )}
            {erreur && <p className="mt-2 text-[13px] font-semibold text-rouge">{erreur}</p>}
            <Link href="/parametres?rubrique=retours" className="mt-2.5 inline-block text-[13px] font-bold text-cobalt hover:underline">
              Voir tous les retours
            </Link>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => (ouvert ? (arreter(), setOuvert(false)) : setOuvert(true))}
        aria-expanded={ouvert}
        aria-label={ouvert ? 'Fermer la bulle des retours' : 'Une idée pour améliorer Chantio ?'}
        title={ouvert ? undefined : 'Une idée pour améliorer Chantio ?'}
        className="fixed right-5 bottom-5 z-[55] grid h-[60px] w-[60px] place-items-center rounded-full bg-encre text-white shadow-[0_14px_30px_-10px_rgb(16_26_61/0.6)] transition hover:scale-105 max-menu:bottom-[calc(84px+env(safe-area-inset-bottom))] max-menu:h-[52px] max-menu:w-[52px]"
      >
        <Icone nom={ouvert ? 'fermer' : 'bulle'} taille={26} />
      </button>
    </>
  );
}
