'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cheminLogo, cheminPhotoProfil } from '@chantio/shared';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { Icone } from './icones';

/** Réduit l'image avant l'envoi (photo carrée 512 px, logo 600 px de large au plus). */
async function preparer(fichier: File, logo: boolean): Promise<Blob> {
  const image = await createImageBitmap(fichier);
  const toile = document.createElement('canvas');
  if (logo) {
    const echelle = Math.min(1, 600 / image.width);
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    toile.getContext('2d')!.drawImage(image, 0, 0, toile.width, toile.height);
  } else {
    const cote = Math.min(image.width, image.height);
    toile.width = toile.height = Math.min(512, cote);
    toile
      .getContext('2d')!
      .drawImage(image, (image.width - cote) / 2, (image.height - cote) / 2, cote, cote, 0, 0, toile.width, toile.height);
  }
  return new Promise((ok, ko) =>
    toile.toBlob((b) => (b ? ok(b) : ko(new Error('Image illisible'))), logo ? 'image/png' : 'image/jpeg', 0.85),
  );
}

export function EnvoiPhoto({
  entrepriseId,
  membreId,
  logo = false,
  libelle,
}: {
  entrepriseId: string;
  membreId?: string;
  logo?: boolean;
  libelle: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<'' | 'envoi' | 'erreur'>('');

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setEtat('envoi');
    try {
      const contenu = await preparer(fichier, logo);
      const chemin = logo ? cheminLogo(entrepriseId, 'png') : cheminPhotoProfil(entrepriseId, membreId!);
      const supabase = supabaseNavigateur();
      const { error: e1 } = await supabase.storage
        .from('profils')
        .upload(chemin, contenu, { contentType: logo ? 'image/png' : 'image/jpeg' });
      if (e1) throw e1;
      const { error: e2 } = await supabase.rpc(logo ? 'definir_logo' : 'definir_photo', { p_chemin: chemin });
      if (e2) throw e2;
      setEtat('');
      router.refresh();
    } catch {
      setEtat('erreur');
    }
  }

  return (
    <div>
      <input ref={champ} type="file" accept="image/*" className="hidden" onChange={choisir} />
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={etat === 'envoi'}
        className="inline-flex items-center gap-2 rounded-2xl bg-doux px-4 py-2.5 text-sm font-bold transition hover:bg-trait active:scale-[0.97] disabled:opacity-60"
      >
        <Icone nom="photo" taille={18} />
        {etat === 'envoi' ? 'Envoi…' : libelle}
      </button>
      {etat === 'erreur' && <p className="mt-2 text-sm font-semibold text-rouge">L’envoi n’a pas marché. Réessayez.</p>}
    </div>
  );
}
