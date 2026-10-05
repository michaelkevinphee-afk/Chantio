import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Icone, type NomIcone } from '@/components/icones';
import { LienBouton, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';

export const metadata = { title: 'Ventes · Chantio' };

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

// Page du bouton « Ventes » de la barre du bas (téléphone) ; sur ordinateur, le menu montre déjà ses entrées.
export default async function Ventes() {
  const { supabase } = await contexteBureau();
  const compter = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });
  const [{ count: aEncaisser }, { count: enAttente }, { count: clients }, { count: articles }] = await Promise.all([
    compter('documents').eq('genre', 'facture').eq('statut', 'a_encaisser').neq('type_facture', 'avoir'),
    compter('documents').eq('genre', 'devis').eq('statut', 'envoye'),
    compter('clients'),
    compter('articles').eq('actif', true),
  ]);

  const cartes: { href: string; icone: NomIcone; titre: string; texte: string; info?: string }[] = [
    {
      href: '/factures',
      icone: 'ticket',
      titre: 'Factures',
      texte: 'Créer une facture, suivre les paiements.',
      info: aEncaisser ? pluriel(aEncaisser, 'facture à encaisser', 'factures à encaisser') : undefined,
    },
    {
      href: '/devis',
      icone: 'devis',
      titre: 'Devis',
      texte: 'Créer un devis, répondre à un appel d’offres, suivre les réponses.',
      info: enAttente ? pluriel(enAttente, 'devis en attente de réponse', 'devis en attente de réponse') : undefined,
    },
    {
      href: '/clients',
      icone: 'immeuble',
      titre: 'Clients',
      texte: 'Les fiches clients, les immeubles et les contrats d’entretien.',
      info: pluriel(clients ?? 0, 'client', 'clients'),
    },
    {
      href: '/produits-services',
      icone: 'cube',
      titre: 'Produits et services',
      texte: 'Ouvrages, fournitures, main d’œuvre et forfaits.',
      info: pluriel(articles ?? 0, 'article', 'articles'),
    },
    { href: '/chiffres', icone: 'chiffres', titre: 'Chiffres', texte: 'Facturé, encaissé, charge de l’équipe et marges des chantiers.' },
  ];

  return (
    <>
      <Titre
        texte="Vos factures, vos devis, vos clients, vos produits et services, vos chiffres."
        actions={
          <LienBouton href="/devis/import?depuis=ventes" variante="secondaire" className="px-4 py-2.5 !text-cobalt">
            Importer
          </LienBouton>
        }
      >
        Ventes
      </Titre>
      <div className="grid gap-4 min-[900px]:grid-cols-3">
        {cartes.map((c, i) => (
          <Link
            key={c.href}
            href={c.href}
            style={{ '--i': i } as CSSProperties}
            className="carte carte-lien apparition grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 p-4"
          >
            <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[12px] bg-doux text-cobalt">
              <Icone nom={c.icone} taille={22} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <b className="text-[17px] font-extrabold">{c.titre}</b>
              <span className="text-sm text-gris">{c.texte}</span>
              {c.info && <small className="text-[13px] font-bold text-cobalt">{c.info}</small>}
            </span>
            <span aria-hidden="true" className="text-2xl leading-none text-gris">
              ›
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
