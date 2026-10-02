import { contexteBureau } from '@/lib/session';
import { Reglages } from './reglages';

export const metadata = { title: 'Mentions de facturation · Chantio' };

export default async function PageReglages() {
  const { entreprise, membre } = await contexteBureau();
  return <Reglages valeurs={{ siret: entreprise.siret ?? '', ...(entreprise.facturation ?? {}) }} modifiable={membre.role === 'dirigeant'} />;
}
