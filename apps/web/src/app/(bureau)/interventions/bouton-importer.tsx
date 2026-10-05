'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { annoncer } from '@/components/retour';
import { classeBouton } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { PARAMS_FICHE } from './adresse';
import { lireFicheImportee } from './import-fiche';

const TAILLE_MAX = 20 * 1024 * 1024;

/**
 * « Importer » : choisir une fiche d'intervention déjà faite (PDF, scan ou photo). Chantio la lit et ouvre
 * la fenêtre « Nouvelle intervention » pré-remplie (client, adresse, date, motif, travaux et fournitures).
 */
export function BoutonImporterFiche({ entrepriseId }: { entrepriseId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const champ = useRef<HTMLInputElement>(null);
  const [lecture, setLecture] = useState(false);

  const importer = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > TAILLE_MAX || !/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) {
      annoncer('PDF ou photo (JPG, PNG, WEBP), 20 Mo au plus', 'erreur');
      return;
    }
    setLecture(true);
    const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const chemin = `${entrepriseId}/imports/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, f, { contentType: f.type || undefined });
    if (error) {
      setLecture(false);
      annoncer('Envoi impossible, réessayez', 'erreur');
      return;
    }
    const r = await lireFicheImportee({ nom: f.name, chemin, taille: f.size, type: f.type });
    setLecture(false);
    if (!r.ok) {
      annoncer(r.erreur, 'erreur');
      return;
    }
    const p = new URLSearchParams(params.toString());
    for (const cle of PARAMS_FICHE) p.delete(cle);
    p.set('nouvelle', '1');
    p.set('importe', r.id);
    router.push(`/interventions?${p}`, { scroll: false });
  };

  return (
    <>
      <button
        type="button"
        disabled={lecture}
        onClick={() => champ.current?.click()}
        title="Importer une fiche d’intervention déjà faite (PDF ou photo)"
        className={classeBouton('secondaire', 'px-4 py-2.5 !text-cobalt')}
      >
        {lecture ? 'Lecture de la fiche…' : 'Importer'}
      </button>
      <input
        ref={champ}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        hidden
        onChange={(e) => {
          importer(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}
