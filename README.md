# EDICREA AI

Plateforme de création graphique, de mise en page et d'édition assistée par IA.
*De l'idée au livre, de l'imagination à l'affiche, jusqu'au document prêt à imprimer.*

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # version de production dans dist/
```

L'application fonctionne entièrement hors-ligne. Pour activer l'IA, renseignez une clé API Anthropic dans **Paramètres** (modèle par défaut : `claude-opus-5-5`).

## Application téléphone et ordinateur

EDICREA AI est une application web installable (PWA) : depuis l'adresse du site, elle s'installe sur Android, iPhone/iPad, Windows et macOS (bouton « Installer l'application » dans le menu). Elle s'ouvre alors en plein écran avec sa propre icône et fonctionne hors-ligne ; l'IA nécessite une connexion.

- `public/manifest.webmanifest` : nom, icônes, raccourcis.
- `public/sw.js` : service worker (cache hors-ligne, mises à jour automatiques).
- `public/brand/logo-01.svg` … `logo-10.svg` : propositions de logo.
- `node scripts/make-icons.cjs 03` : régénère toutes les icônes à partir du logo choisi.

## Modules

| Module | Contenu |
|---|---|
| **Livre — 1. Importer** | DOCX (titres, listes, tableaux, images), PDF texte, TXT/Markdown, texte collé ; PDF scannés et images via OCR IA. Détection automatique des chapitres. |
| **2. Corriger** | 3 modes (simple, professionnel, révision éditoriale). Correcteur local (orthographe courante, grammaire, typographie française, répétitions, phrases longues) + correction IA par lots. Chaque suggestion s'accepte, se refuse, se modifie ou se compare ; rien n'est jamais remplacé en silence. Reformulation IA d'un passage sélectionné, comparaison mot à mot avec l'original, rapport éditorial. |
| **3. Composer** | Plan par chapitres, édition des blocs (titres 1-3, paragraphe, citation, liste, encadré, image, tableau, saut de page), annotations, styles de paragraphe et de caractère, uniformisation des titres, structuration IA. |
| **4. Mise en page** | Moteur de pagination maison : formats, marges miroir, colonnes, gouttières, fonds perdus, page de titre, sommaire automatique avec numéros, chapitres en belle page (pages vierges insérées), en-têtes courants, folios, veuves/orphelines, aperçu en doubles pages identique au PDF. |
| **5. Couverture** | 4 concepts distincts (1ʳᵉ, dos calculé selon le nombre de pages et le papier, 4ᵉ avec code-barres ISBN), puis édition complète dans le studio graphique. Direction artistique et illustrations vectorielles par IA en option. |
| **6. Finaliser** | Vérification avant impression (polices, marges, fonds perdus, résolution des images, cahiers de 4), aperçu 3D, exports PDF imprimeur (CMJN, traits de coupe), PDF HD, PDF interactif (sommaire cliquable, signets), DOCX, couverture PDF 300 dpi, projet `.edicrea`. |
| **Studio d'affiches** | Brief en langage naturel → 4 propositions ; formats impression (A4 à kakémono) et réseaux sociaux. |
| **Studio graphique** | Sélection rectangle et lasso, main, texte, formes, étoile, ligne, plume vectorielle (courbes lissées), crayon, pinceau, aérographe, gomme, correcteur (suppression d'objet), calques (ordre, visibilité, verrouillage, renommage, groupes, masques), modes de fusion, dégradés, ombres et lueurs, retouche photo (luminosité, contraste, saturation, vibrance, balance des couleurs, teinte, gamma, netteté, flou, grain, N&B, sépia), recadrage, détourage des fonds unis, typographie (approche, crénage sur sélection, interlignage, texte sur tracé), alignement et répartition, grille, magnétisme, repères, annuler/rétablir, exports PNG/JPG/SVG/TIFF/PDF, modèles. |
| **Assistant IA** | Accessible partout ; comprend le contexte (projet, étape, document) et déclenche les actions réelles de l'application (correction, sommaire, impression, couvertures, affiches, retouche du design ouvert). Mode local sans clé pour les commandes courantes. |
| **Transverse** | Tableau de bord, projets par type et par client, modèles, bibliothèque (images, logos, polices importées, palettes), historique, versions (création, restauration, comparaison), commentaires, sauvegarde automatique, thèmes clair/sombre. |

## Architecture

```
src/
  lib/          modèle de données, stockage (IndexedDB), import, correcteur, pagination, exports, IA, actions
  graphics/     moteur graphique (Fabric.js) : réglages, gabarits de couverture/affiche, opérations pixel, TIFF
  components/   interface : coque, pages, parcours livre, studio d'affiches, éditeur graphique, assistant
public/fonts/   polices Liberation (SIL OFL) incorporées dans les PDF et utilisées pour l'aperçu
```

Chaque module (import, correction, pagination, export, gabarits, éditeur) est indépendant et communique par le modèle de données de `src/lib/types.ts`. Le format `.edicrea` est ce même modèle en JSON.

## Limites actuelles et suite prévue

- **Pas encore de backend** : les données restent dans le navigateur. La collaboration en temps réel, les comptes, les rôles et droits d'accès, le stockage objet et le proxy IA demandent le backend NestJS + PostgreSQL prévu. Le paramètre « URL de l'API » permet déjà de faire passer l'IA par un proxy.
- **Couleur** : conversion CMJN simplifiée des textes et filets, sans profil ICC (FOGRA, etc.). Les couvertures et affiches sont exportées en raster 300 dpi RVB.
- **Images IA** : l'IA produit des illustrations vectorielles (SVG). Pas de génération d'images photoréalistes.
- **Détourage** : efficace sur les fonds unis ou peu texturés ; pas de segmentation par réseau de neurones.
- **Mise en page** : mise en forme au niveau du paragraphe (pas de gras ou d'italique à l'intérieur d'un paragraphe), pas de césure automatique, trois familles de polices pour le corps du livre.
- **Import** : `.doc` ancien non pris en charge (enregistrer en `.docx`).
