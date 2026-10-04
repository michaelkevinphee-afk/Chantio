// Lecture d'un tableau Excel (.xlsx) ou CSV dans le navigateur, sans
// bibliothèque : un .xlsx est un zip de fichiers XML (feuilles et textes
// partagés). Sert à lire le cadre de réponse d'un appel d'offres (DPGF).

type Entree = { methode: number; taille: number; offset: number };

/** Les rangées de la première feuille (ou du CSV), chaque cellule en texte. */
export async function lireTableur(fichier: File): Promise<string[][]> {
  if (/\.(csv|txt)$/i.test(fichier.name)) return lireCsv(await fichier.text());
  if (!/\.xlsx$/i.test(fichier.name)) throw new Error('Enregistrez le tableau du client au format .xlsx ou CSV depuis Excel, puis importez-le.');
  const zip = ouvrirZip(await fichier.arrayBuffer());
  const xml = (t: string) => new DOMParser().parseFromString(t, 'application/xml');

  const textes = await zip.lire('xl/sharedStrings.xml');
  const partages = textes
    ? [...xml(textes).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
    : [];

  const feuille = (await cheminPremiereFeuille(zip, xml)) ?? 'xl/worksheets/sheet1.xml';
  const contenu = await zip.lire(feuille);
  if (!contenu) throw new Error('Aucune feuille trouvée dans ce fichier Excel.');

  const rangees: string[][] = [];
  for (const row of xml(contenu).getElementsByTagName('row')) {
    const r: string[] = [];
    for (const c of row.getElementsByTagName('c')) {
      const col = colonne(c.getAttribute('r') ?? '');
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const valeur =
        type === 's'
          ? (partages[Number(v)] ?? '')
          : type === 'inlineStr'
            ? [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
            : v;
      r[col >= 0 ? col : r.length] = valeur;
    }
    rangees.push(Array.from(r, (x) => x ?? ''));
  }
  return rangees;
}

/** « AB12 » → 27 (colonnes comptées depuis 0). */
function colonne(ref: string): number {
  const lettres = ref.match(/^[A-Z]+/)?.[0];
  if (!lettres) return -1;
  return [...lettres].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
}

async function cheminPremiereFeuille(zip: ReturnType<typeof ouvrirZip>, xml: (t: string) => Document): Promise<string | null> {
  const [classeur, liens] = await Promise.all([zip.lire('xl/workbook.xml'), zip.lire('xl/_rels/workbook.xml.rels')]);
  if (!classeur || !liens) return null;
  const id = xml(classeur).getElementsByTagName('sheet')[0]?.getAttribute('r:id');
  const cible = [...xml(liens).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === id)?.getAttribute('Target');
  if (!cible) return null;
  return cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`;
}

function ouvrirZip(buf: ArrayBuffer) {
  const v = new DataView(buf);
  const dec = new TextDecoder();
  // Fin du répertoire central : cherchée depuis la fin (un commentaire peut suivre).
  let fin = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('Ce fichier Excel est illisible.');
  const entrees = new Map<string, Entree>();
  let p = v.getUint32(fin + 16, true);
  for (let k = v.getUint16(fin + 10, true); k > 0 && v.getUint32(p, true) === 0x02014b50; k--) {
    const longueurNom = v.getUint16(p + 28, true);
    const nom = dec.decode(new Uint8Array(buf, p + 46, longueurNom));
    entrees.set(nom, { methode: v.getUint16(p + 10, true), taille: v.getUint32(p + 20, true), offset: v.getUint32(p + 42, true) });
    p += 46 + longueurNom + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return {
    async lire(nom: string): Promise<string | null> {
      const e = entrees.get(nom);
      if (!e) return null;
      const debut = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
      const donnees = new Uint8Array(buf, debut, e.taille);
      if (e.methode === 0) return dec.decode(donnees);
      if (e.methode !== 8) throw new Error('Ce fichier Excel utilise une compression inconnue.');
      const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(flux).text();
    },
  };
}

/** CSV d'Excel : point-virgule (version française), virgule ou tabulation, guillemets gérés. */
export function lireCsv(texte: string): string[][] {
  const premiere = texte.split(/\r?\n/, 1)[0] ?? '';
  const compte = (c: string) => premiere.split(c).length - 1;
  const sep = compte('\t') > compte(';') && compte('\t') > compte(',') ? '\t' : compte(';') >= compte(',') ? ';' : ',';
  const rangees: string[][] = [];
  let r: string[] = [];
  let cellule = '';
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (guillemets) {
      if (ch === '"' && texte[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (ch === '"') guillemets = false;
      else cellule += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) {
      r.push(cellule.trim());
      cellule = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texte[i + 1] === '\n') i++;
      r.push(cellule.trim());
      rangees.push(r);
      r = [];
      cellule = '';
    } else cellule += ch;
  }
  if (cellule || r.length) {
    r.push(cellule.trim());
    rangees.push(r);
  }
  return rangees;
}
