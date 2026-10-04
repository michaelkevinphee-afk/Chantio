// État global de l'appli : mode (Supabase ou démo), connexion, profil,
// interventions (avec cache local) et boîte d'envoi.
import NetInfo from '@react-native-community/netinfo';
import type { Session as SessionAuth } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { effacerBrouillon, versFiche, type Brouillon } from './brouillons';
import { configurationOk } from './config';
import { enErreur, type EntrepriseDuCompte, type InterventionVue, type Profil, type SourceDonnees } from './donnees';
import { abonner, ajouter, estEnAttente, reinitialiserBoite, traiterBoite, type Operation } from './envoi';
import { autoriserPosition, positionActuelle, usePartagePosition } from './position';
import { sourceDemo } from './source-demo';
import { sourceSupabase } from './source-supabase';
import { ecrire, lire, stockageEnMemoire } from './stockage';
import { supabase } from './supabase';

export type EtatSession = 'chargement' | 'configuration' | 'connexion' | 'entreprise' | 'pret';

interface Session {
  etat: EtatSession;
  source: SourceDonnees | null;
  profil: Profil | null;
  erreurProfil: string | null;
  interventions: InterventionVue[];
  chargementListe: boolean;
  erreurListe: string | null;
  majLe: string | null;
  horsLigne: boolean;
  enAttente: Operation[];
  /** Photo de profil affichable (lien signé ou fichier local), sinon null. */
  photo: string | null;
  changerPhoto(uriLocale: string): Promise<void>;
  retirerPhoto(): Promise<void>;
  activerDemo(): void;
  quitterDemo(): void;
  /** Connexion habituelle : e-mail + mot de passe. */
  connecter(email: string, motDePasse: string): Promise<void>;
  /** Première connexion ou mot de passe oublié : un code arrive par e-mail. */
  envoyerCode(email: string): Promise<void>;
  /**
   * Valide le code (donc l'adresse e-mail) puis enregistre le nouveau mot de passe.
   * Si le mot de passe est refusé, lève `ErreurMotDePasse` : l'écran reste affiché et
   * un nouvel essai se fait avec `code = null` (le code est déjà utilisé).
   */
  verifierCode(email: string, code: string | null, motDePasse: string): Promise<void>;
  /** Abandonne la création du mot de passe après un code validé (déconnecte). */
  annulerMotDePasse(): Promise<void>;
  creerEntreprise(nom: string, prenom: string): Promise<void>;
  /** Les entreprises du compte (vide hors ligne). */
  listerEntreprises(): Promise<EntrepriseDuCompte[]>;
  /** Passe sur une autre entreprise du compte, puis recharge le profil et la journée. */
  changerEntreprise(id: string): Promise<void>;
  deconnecter(): Promise<void>;
  rechargerProfil(): void;
  rafraichir(): Promise<void>;
  demarrer(intervention: InterventionVue): void;
  /** Active ou coupe le partage de position (demande l'autorisation du téléphone en l'activant). */
  reglerPartage(actif: boolean): Promise<void>;
  envoyerFiche(brouillon: Brouillon): Promise<'envoyee' | 'en_attente'>;
}

/** Code accepté mais mot de passe refusé : l'écran de connexion propose de réessayer. */
export class ErreurMotDePasse extends Error {}

const Contexte = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession hors de SessionProvider');
  return s;
}

const cleProfil = (uid: string) => `chantio:profil:${uid}`;
const cleListe = (membreId: string) => `chantio:interventions:${membreId}`;

/** Statut affiché en tenant compte de ce qui attend dans la boîte d'envoi. */
function appliquerFile(liste: InterventionVue[], ops: Operation[]): InterventionVue[] {
  if (!ops.length) return liste;
  return liste.map((i) => {
    let statut = i.statut;
    for (const op of ops) {
      if (op.type === 'demarrer' && op.interventionId === i.id && (statut === 'planifiee' || statut === 'a_planifier')) {
        statut = 'en_cours';
      }
      if (op.type === 'fiche' && op.fiche.intervention_id === i.id) {
        statut = op.fiche.resultat === 'termine' ? 'terminee' : 'a_reprendre';
      }
    }
    return statut === i.statut ? i : { ...i, statut };
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [auth, setAuth] = useState<SessionAuth | null | undefined>(undefined);
  const [profil, setProfil] = useState<Profil | null | undefined>(undefined);
  const [erreurProfil, setErreurProfil] = useState<string | null>(null);
  const [essaiProfil, setEssaiProfil] = useState(0);
  const [brute, setBrute] = useState<InterventionVue[]>([]);
  const [chargementListe, setChargementListe] = useState(false);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [majLe, setMajLe] = useState<string | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState<Operation[]>([]);
  const [photo, setPhoto] = useState<{ chemin: string; url: string | null } | null>(null);

  const source: SourceDonnees | null = demo ? sourceDemo : configurationOk ? sourceSupabase : null;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Pendant la création du mot de passe (après le code), on garde la session de côté :
  // sinon l'appli quitterait l'écran de connexion avant que le mot de passe soit enregistré.
  const mdpEnCours = useRef(false);
  const sessionEnAttente = useRef<SessionAuth | null>(null);

  // Connexion Supabase : session persistée, puis suivi des changements.
  useEffect(() => {
    if (demo || !configurationOk) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = sb.auth.onAuthStateChange((_evt, session) => {
      if (mdpEnCours.current) {
        sessionEnAttente.current = session;
        return;
      }
      // Ne pas appeler Supabase dans ce rappel : on diffère.
      setTimeout(() => setAuth(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [demo]);

  const uid = demo ? 'demo' : auth?.user.id;

  // Profil (membre + entreprise), avec repli sur la dernière version connue hors ligne.
  useEffect(() => {
    if (!source || !uid) {
      setProfil(undefined);
      return;
    }
    let annule = false;
    setErreurProfil(null);
    (async () => {
      try {
        const p = await source.chargerProfil();
        if (annule) return;
        setProfil(p);
        if (p) await ecrire(cleProfil(uid), p);
      } catch (e) {
        const cache = await lire<Profil>(cleProfil(uid));
        if (annule) return;
        if (cache) setProfil(cache);
        else setErreurProfil(enErreur(e).message);
      }
    })();
    return () => {
      annule = true;
    };
  }, [uid, demo, essaiProfil]);

  // Réseau et boîte d'envoi.
  useEffect(() => abonner(setEnAttente), [demo]);

  const vider = useCallback(async () => {
    const s = sourceRef.current;
    if (!s) return;
    await traiterBoite(s);
  }, []);

  useEffect(() => {
    let etaitHorsLigne = false;
    const desabonner = NetInfo.addEventListener((etat) => {
      const hl = etat.isConnected === false;
      setHorsLigne(hl);
      if (etaitHorsLigne && !hl) vider();
      etaitHorsLigne = hl;
    });
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') vider();
    });
    return () => {
      desabonner();
      sub.remove();
    };
  }, [vider]);

  const membreId = profil?.membre.id;
  const cheminPhoto = profil?.membre.photo_chemin ?? null;

  // Lien d'affichage de la photo de profil (signé, valable 24 h).
  useEffect(() => {
    const s = sourceRef.current;
    if (!s || !cheminPhoto) return;
    if (photo?.chemin === cheminPhoto && photo.url) return;
    let annule = false;
    s.urlPhotoProfil(cheminPhoto)
      .then((url) => {
        if (!annule) setPhoto({ chemin: cheminPhoto, url });
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [cheminPhoto]);

  usePartagePosition(profil ?? null, source);

  const majMembre = async (modif: Partial<Profil['membre']>) => {
    if (!profil) return;
    const p = { ...profil, membre: { ...profil.membre, ...modif } };
    setProfil(p);
    if (uid) await ecrire(cleProfil(uid), p);
  };

  const rafraichir = useCallback(async () => {
    const s = sourceRef.current;
    if (!s || !membreId) return;
    setChargementListe(true);
    try {
      await traiterBoite(s);
      const liste = await s.listerInterventions();
      const maintenant = new Date().toISOString();
      setBrute(liste);
      setMajLe(maintenant);
      setErreurListe(null);
      await ecrire(cleListe(membreId), { liste, majLe: maintenant });
    } catch (e) {
      setErreurListe(enErreur(e).message);
    } finally {
      setChargementListe(false);
    }
  }, [membreId]);

  // Au chargement du profil : d'abord le cache, puis le serveur.
  useEffect(() => {
    if (!membreId) {
      setBrute([]);
      return;
    }
    let annule = false;
    lire<{ liste: InterventionVue[]; majLe: string }>(cleListe(membreId)).then((c) => {
      if (c && !annule) {
        setBrute(c.liste);
        setMajLe(c.majLe);
      }
      rafraichir();
    });
    return () => {
      annule = true;
    };
  }, [membreId, rafraichir]);

  const interventions = useMemo(() => appliquerFile(brute, enAttente), [brute, enAttente]);

  let etat: EtatSession;
  if (!source) etat = 'configuration';
  else if (!demo && auth === undefined) etat = 'chargement';
  else if (!uid) etat = 'connexion';
  else if (profil === undefined) etat = 'chargement';
  else if (profil === null) etat = 'entreprise';
  else etat = 'pret';

  const changerMode = (oui: boolean) => {
    stockageEnMemoire(oui);
    reinitialiserBoite();
    setProfil(undefined);
    setBrute([]);
    setDemo(oui);
  };

  /** Note l'heure (et le lieu, si la localisation est autorisée) de Démarrer / Terminer, sans faire attendre l'écran. */
  const pointer = (interventionId: string, genre: 'arrivee' | 'depart') => {
    const le = new Date().toISOString();
    positionActuelle()
      .then((position) => ajouter({ type: 'pointage', id: `${genre}:${interventionId}:${le}`, interventionId, genre, position, le }))
      .then(vider)
      .catch(() => {});
  };

  const valeur: Session = {
    etat,
    source,
    profil: profil ?? null,
    erreurProfil,
    interventions,
    chargementListe,
    erreurListe,
    majLe,
    horsLigne,
    enAttente,
    photo: cheminPhoto && photo?.chemin === cheminPhoto ? photo.url : null,
    async changerPhoto(uriLocale) {
      if (!profil || !source) throw new Error('Session expirée');
      if (horsLigne) throw new Error('Pas de réseau. Réessaie quand tu auras du réseau.');
      const chemin = await source.changerPhotoProfil(profil.membre, uriLocale);
      // Affichage immédiat avec le fichier local, sans attendre le lien signé.
      setPhoto({ chemin, url: uriLocale });
      await majMembre({ photo_chemin: chemin });
    },
    async retirerPhoto() {
      if (!source) return;
      if (horsLigne) throw new Error('Pas de réseau. Réessaie quand tu auras du réseau.');
      await source.retirerPhotoProfil();
      setPhoto(null);
      await majMembre({ photo_chemin: null });
    },
    activerDemo: () => changerMode(true),
    quitterDemo: () => changerMode(false),
    async connecter(email, motDePasse) {
      const { error } = await supabase().auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw enErreur(error);
    },
    async envoyerCode(email) {
      const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw enErreur(error);
    },
    async verifierCode(email, code, motDePasse) {
      const sb = supabase();
      mdpEnCours.current = true;
      if (code) {
        const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) {
          mdpEnCours.current = false;
          throw enErreur(error);
        }
      }
      const { error: errMdp } = await sb.auth.updateUser({ password: motDePasse });
      // Remettre le même mot de passe n'est pas une erreur pour le technicien.
      if (errMdp && errMdp.code !== 'same_password') throw new ErreurMotDePasse(errMdp.message);
      mdpEnCours.current = false;
      const session = sessionEnAttente.current ?? (await sb.auth.getSession()).data.session;
      sessionEnAttente.current = null;
      setAuth(session);
    },
    async annulerMotDePasse() {
      if (!mdpEnCours.current) return;
      mdpEnCours.current = false;
      sessionEnAttente.current = null;
      await supabase().auth.signOut();
    },
    async creerEntreprise(nom, prenom) {
      if (!source) return;
      await source.creerEntreprise(nom, prenom);
      setEssaiProfil((n) => n + 1);
    },
    async listerEntreprises() {
      if (!source) return [];
      return source.listerEntreprises().catch(() => []);
    },
    async changerEntreprise(id) {
      if (!source) return;
      await source.choisirEntreprise(id);
      setEssaiProfil((n) => n + 1);
      await rafraichir();
    },
    async deconnecter() {
      if (demo) return changerMode(false);
      await supabase().auth.signOut();
      setProfil(undefined);
      setBrute([]);
    },
    rechargerProfil: () => setEssaiProfil((n) => n + 1),
    rafraichir,
    demarrer(intervention) {
      if (intervention.statut === 'en_cours') return;
      ajouter({ type: 'demarrer', id: `demarrer:${intervention.id}`, interventionId: intervention.id }).then(vider);
      pointer(intervention.id, 'arrivee');
    },
    async reglerPartage(actif) {
      if (!source || !profil) throw new Error('Session expirée');
      if (actif && !(await autoriserPosition())) {
        throw new Error("Autorise la localisation pour Chantio dans les réglages du téléphone, puis réessaie.");
      }
      if (horsLigne) throw new Error('Pas de réseau. Réessaie quand tu auras du réseau.');
      await source.reglerPartagePosition(actif);
      await majMembre({ partage_position: actif, partage_position_le: actif ? new Date().toISOString() : null });
    },
    async envoyerFiche(b) {
      if (!profil || !source) throw new Error('Session expirée');
      const fiche = versFiche(b, profil.entreprise.id);
      await ajouter({
        type: 'fiche',
        id: b.ficheId,
        fiche,
        photos: b.photos.map((p, i) => ({ chemin: fiche.medias[i].chemin, uri: p.uri })),
        deposees: [],
      });
      await effacerBrouillon(b.interventionId);
      pointer(b.interventionId, 'depart');
      if (horsLigne) return 'en_attente';
      await traiterBoite(source);
      const partie = !(await estEnAttente(b.ficheId));
      if (partie) rafraichir();
      return partie ? 'envoyee' : 'en_attente';
    },
  };

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
