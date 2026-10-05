'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { euro } from '@chantio/shared';
import { annoncer } from '@/components/retour';
import type { ImportLu } from '@/lib/devis';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { enregistrerImports, lireImport, supprimerImport } from '../actions';
import { Blocs, Ecran, Picto } from '../composants';

type EnCours = { cle: string; nom: string; type: string; etat: 'envoi' | 'lecture' | 'fait' | 'erreur'; p: number; detail: string; id?: string };

const FORMATS = '.pdf,.jpg,.jpeg,.png,.webp,.heic';
const TAILLE_MAX = 20 * 1024 * 1024;

function typeCourt(nom: string) {
  const ext = nom.split('.').pop()?.toUpperCase() ?? '';
  return ext === 'JPEG' ? 'JPG' : ext.slice(0, 4);
}

function detailImport(i: ImportLu): string {
  const c = i.champs ?? {};
  if (i.statut === 'a_lire') return 'En attente de lecture';
  if (i.statut === 'erreur') return c.message ?? 'Lecture impossible';
  if (i.statut === 'converti') return 'Transformé en document';
  const doutes = Object.values(c.confiance ?? {}).filter((v) => v < 80).length;
  const morceaux = [c.genre === 'facture' ? 'Facture' : c.genre === 'devis' ? 'Devis' : null, c.client, c.total_ttc ? `${euro(c.total_ttc)} TTC` : null].filter(Boolean);
  return (morceaux.length ? morceaux.join(' · ') : (c.message ?? 'À compléter')) + (doutes ? ` · ${doutes} champ${doutes > 1 ? 's' : ''} à vérifier` : '');
}

export function Import({ entrepriseId, imports, lecture }: { entrepriseId: string; imports: ImportLu[]; lecture: boolean }) {
  const router = useRouter();
  const [survol, setSurvol] = useState(false);
  const [fichiers, setFichiers] = useState<EnCours[]>([]);
  const champ = useRef<HTMLInputElement>(null);
  const maj = (cle: string, p: Partial<EnCours>) => setFichiers((fs) => fs.map((f) => (f.cle === cle ? { ...f, ...p } : f)));

  const deposer = async (liste: FileList | File[] | null) => {
    const tous = Array.from(liste ?? []);
    if (!tous.length) return;
    const valides = tous.filter((f) => f.size <= TAILLE_MAX && /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name));
    if (valides.length < tous.length) annoncer('Certains fichiers sont ignorés : PDF ou photo, 20 Mo au plus', 'erreur');
    const nouveaux: EnCours[] = valides.map((f) => ({ cle: crypto.randomUUID(), nom: f.name, type: typeCourt(f.name), etat: 'envoi', p: 10, detail: 'Envoi…' }));
    setFichiers((fs) => [...nouveaux, ...fs]);
    const supabase = supabaseNavigateur();

    const envoyes: { nom: string; chemin: string; taille: number; type: string; cle: string }[] = [];
    await Promise.all(
      valides.map(async (f, n) => {
        const cle = nouveaux[n].cle;
        const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
        const chemin = `${entrepriseId}/imports/${cle}.${ext}`;
        const { error } = await supabase.storage.from('documents').upload(chemin, f, { contentType: f.type || undefined });
        if (error) {
          maj(cle, { etat: 'erreur', p: 100, detail: 'Envoi impossible, réessayez' });
          return;
        }
        maj(cle, { p: 40, detail: 'Reçu' });
        envoyes.push({ nom: f.name, chemin, taille: f.size, type: f.type, cle });
      }),
    );
    if (!envoyes.length) return;
    const r = await enregistrerImports(envoyes);
    if (!r.ok) {
      annoncer(r.erreur, 'erreur');
      return;
    }
    // Lecture une par une (la plus longue étape).
    for (const [n, idImport] of r.ids.entries()) {
      const cle = envoyes[n].cle;
      maj(cle, { etat: 'lecture', p: 64, detail: lecture ? 'Lecture du document…' : 'Préparation…', id: idImport });
      const lu = await lireImport(idImport);
      if (!lu.ok) maj(cle, { etat: 'erreur', p: 100, detail: lu.erreur });
      else {
        const c = lu.champs;
        const doutes = Object.values(c.confiance ?? {}).filter((v) => v < 80).length;
        maj(cle, {
          etat: 'fait',
          p: 100,
          detail:
            c.message && !c.client
              ? c.message
              : [c.genre === 'facture' ? 'Facture' : 'Devis', c.client, c.total_ttc ? `${euro(c.total_ttc)} TTC` : null].filter(Boolean).join(' · ') +
                (doutes ? ` · ${doutes} à vérifier` : ''),
        });
      }
    }
    router.refresh();
  };

  const enAttente = imports.filter((i) => i.statut !== 'converti');
  const visibles = new Set(fichiers.map((f) => f.id));

  return (
    <Ecran label="Importer">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/devis" style={{ color: 'inherit' }}>
              Mes devis
            </Link>
          </div>
          <h1>Importer vos documents</h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/devis">
            Retour à la liste
          </Link>
        </div>
      </div>
      <div className="grille-import">
        <div>
          <label
            className={`depot ${survol ? 'survol' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              deposer(e.dataTransfer.files);
            }}
          >
            <Blocs className="blocs" />
            <h2>Glissez un dossier ou des fichiers ici</h2>
            <p>
              Vos anciens devis et factures en PDF, en photo ou scannés.{' '}
              {lecture
                ? 'Chantio lit chaque document et remplit les champs pour vous : client, adresse, lignes, prix et TVA.'
                : 'Ils sont rangés ici ; la lecture automatique sera activée prochainement, en attendant vous complétez les champs à côté du document.'}
            </p>
            <span className="btn plein">Choisir des fichiers</span>
            <input
              ref={champ}
              type="file"
              multiple
              accept={FORMATS}
              hidden
              onChange={(e) => {
                deposer(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="formats">PDF, JPG, PNG, photo de téléphone · 20 Mo maximum par fichier</div>
          </label>
          <div className="carte fichiers">
            <h3>
              Documents importés <span className="pastille p-bleu">{enAttente.length + fichiers.filter((f) => !f.id).length} à traiter</span>
            </h3>
            {fichiers.map((f) => (
              <div className="fichier" key={f.cle}>
                <span className="type">{f.type}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nom">{f.nom}</div>
                  <div className="detail">{f.detail}</div>
                  {f.etat !== 'fait' && f.etat !== 'erreur' && (
                    <div className="barre">
                      <i style={{ width: `${f.p}%` }} />
                    </div>
                  )}
                </div>
                {f.etat === 'fait' && f.id ? (
                  <Link className="btn petit plein" href={`/devis/import/${f.id}`}>
                    Vérifier
                  </Link>
                ) : f.etat === 'erreur' ? (
                  <span className="pastille p-rouge">Erreur</span>
                ) : (
                  <span className="pastille p-bleu">{f.etat === 'envoi' ? 'Envoi' : 'Lecture'}</span>
                )}
              </div>
            ))}
            {enAttente
              .filter((i) => !visibles.has(i.id))
              .map((i) => (
                <div className="fichier" key={i.id}>
                  <span className="type">{typeCourt(i.nom_fichier)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nom">{i.nom_fichier}</div>
                    <div className="detail">{detailImport(i)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn petit fantome"
                      type="button"
                      aria-label={`Retirer ${i.nom_fichier}`}
                      onClick={async () => {
                        const r = await supprimerImport(i.id);
                        if (!r.ok) return annoncer(r.erreur, 'erreur');
                        annoncer('Document retiré');
                        router.refresh();
                      }}
                    >
                      <Picto nom="corbeille" />
                    </button>
                    <Link className="btn petit plein" href={`/devis/import/${i.id}`}>
                      Vérifier
                    </Link>
                  </div>
                </div>
              ))}
            {!fichiers.length && !enAttente.length && (
              <div className="fichier">
                <span className="type">PDF</span>
                <div>
                  <div className="nom">Aucun document pour l’instant</div>
                  <div className="detail">Déposez vos anciens devis et factures pour les retrouver ici.</div>
                </div>
                <span />
              </div>
            )}
          </div>
        </div>
        <div className="carte">
          <div className="sources">
            <div className="surtitre">Ou reprendre depuis votre logiciel</div>
            {(
              [
                ['BG', 'Batigest', 'Exportez vos devis et factures en PDF, puis déposez-les ici'],
                ['EBP', 'EBP Bâtiment', 'Impression en PDF de vos documents, puis dépôt ici'],
                ['OB', 'Obat', 'Téléchargez vos devis et factures en PDF, puis déposez-les ici'],
              ] as const
            ).map(([ico, nom, aide]) => (
              <button key={nom} className="source" type="button" onClick={() => champ.current?.click()}>
                <span className="ico">{ico}</span>
                <div>
                  <b>{nom}</b>
                  <span>{aide}</span>
                </div>
                <span className="fl">›</span>
              </button>
            ))}
            <Link className="source" href="/produits-services">
              <span className="ico">
                <Picto nom="catalogue" taille={20} epaisseur={2} />
              </span>
              <div>
                <b>Tarif fournisseur</b>
                <span>Remplit vos produits et services avec vos prix d’achat (fichier CSV)</span>
              </div>
              <span className="fl">›</span>
            </Link>
            <div className="note-tva">
              Les documents importés ne partent jamais chez le client. Ils arrivent en brouillon, et vous validez chaque champ avant d’en faire un devis ou une
              facture.
            </div>
          </div>
        </div>
      </div>
    </Ecran>
  );
}
