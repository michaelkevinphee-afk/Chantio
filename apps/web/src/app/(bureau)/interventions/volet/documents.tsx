import Link from 'next/link';
import { etatDocument, euro, titreDocument, type GenreDocument, type StatutDocument, type TypeFacture } from '@chantio/shared';
import { Puce } from '@/components/ui';
import { BoutonDocument } from './boutons';
import { SECTION, TITRE_SECTION } from './styles';

export type DocumentLie = {
  id: string;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  numero: string | null;
  statut: StatutDocument;
  objet: string;
  total_ht: number;
  echeance: string | null;
  situation_numero: number | null;
};

/** « Devis et factures » : les documents liés à l'intervention, et « Créer un devis ». */
export function DocumentsLies({
  id,
  documents,
  jour,
  enAvant,
}: {
  id: string;
  documents: DocumentLie[];
  jour: string;
  /** « Créer un devis » est mis en avant par ?chiffrer=1 quand le bandeau n'a pas déjà « Créer le devis ». */
  enAvant: boolean;
}) {
  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>Devis et factures</h3>
      {documents.length ? (
        <div className="flex flex-col">
          {documents.map((d) => {
            const e = etatDocument(d, jour);
            return (
              <Link
                key={d.id}
                href={`/devis/${d.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-b border-trait px-0.5 py-2.5 last:border-b-0 hover:bg-fond"
              >
                <span className="font-mono text-[13px]">{d.numero ?? 'Brouillon'}</span>
                <span className="flex min-w-0 flex-col">
                  <b className="font-bold">{titreDocument(d.genre, d.type_facture, d.situation_numero)}</b>
                  {d.objet && <small className="text-xs text-gris">{d.objet}</small>}
                </span>
                <span className="ml-auto text-right text-[14px] tabular-nums">
                  {euro(Number(d.total_ht))}&nbsp;HT
                  <br />
                  <Puce ton={e.ton}>{e.libelle}</Puce>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-[12.5px] text-gris">Aucun document lié.</p>
      )}
      <div>
        <BoutonDocument id={id} genre="devis" second miseEnAvant={enAvant}>
          Créer un devis
        </BoutonDocument>
      </div>
    </section>
  );
}
