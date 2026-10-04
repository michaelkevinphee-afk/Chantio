'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bouton } from '@/components/ui';
import { Roue } from '@/components/retour';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { envoyerJustificatifs } from '../actions';

const PIECES = [
  { cle: 'identite', libelle: 'Pièce d’identité' },
  { cle: 'kbis', libelle: 'Kbis ou pouvoir' },
] as const;

/** Dépôt de la pièce d'identité et du Kbis dans le stockage privé « justificatifs ». */
export function Justificatifs({ entrepriseId }: { entrepriseId: string }) {
  const router = useRouter();
  const [fichiers, setFichiers] = useState<Partial<Record<(typeof PIECES)[number]['cle'], File>>>({});
  const [etat, setEtat] = useState<'' | 'envoi'>('');
  const [erreur, setErreur] = useState('');
  const complet = PIECES.every((p) => fichiers[p.cle]);

  async function envoyer() {
    setEtat('envoi');
    setErreur('');
    try {
      const supabase = supabaseNavigateur();
      const chemins: string[] = [];
      for (const p of PIECES) {
        const f = fichiers[p.cle]!;
        const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
        const chemin = `${entrepriseId}/${p.cle}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('justificatifs').upload(chemin, f, { contentType: f.type || undefined });
        if (error) throw error;
        chemins.push(chemin);
      }
      const rep = await envoyerJustificatifs(chemins);
      if (rep.erreur) throw new Error(rep.erreur);
      router.refresh();
    } catch (e) {
      setErreur(`Envoi impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
    setEtat('');
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {PIECES.map((p) => (
          <label key={p.cle} className="block cursor-pointer rounded-[14px] border-2 border-dashed border-trait bg-fond p-4 text-center transition hover:border-cobalt">
            <span className="block font-bold">{p.libelle}</span>
            <span className="mt-1 block truncate text-xs text-gris">{fichiers[p.cle]?.name ?? 'PDF ou photo, 10 Mo au plus'}</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 10 * 1024 * 1024) return setErreur('Fichier trop lourd (10 Mo au plus).');
                if (f) setFichiers((fs) => ({ ...fs, [p.cle]: f }));
              }}
            />
          </label>
        ))}
      </div>
      {erreur && <p className="text-sm font-semibold text-rouge">{erreur}</p>}
      <Bouton type="button" onClick={envoyer} disabled={!complet || etat === 'envoi'}>
        {etat === 'envoi' && <Roue />} Envoyer à Chantio
      </Bouton>
    </div>
  );
}
