import { useState, type ReactNode } from 'react'
import { BookOpen, Ruler, BookMarked, PanelLeftOpen, LayoutTemplate, Hash, AlignLeft, ListOrdered, Type, PenTool, HelpCircle, type LucideIcon } from 'lucide-react'
import { Modal } from './ui'

// ───────── Guide intégré : explications pas à pas de chaque fonction de mise en page
export type HelpTopic = 'format' | 'dos' | 'rabats' | 'gabarits' | 'numerotation' | 'veuves' | 'sommaire' | 'typo' | 'libre'

const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{n}</span><span className="pt-0.5">{children}</span></li>
)
const Tip = ({ children }: { children: ReactNode }) => <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]"><b>Conseil :</b> {children}</div>
const Path = ({ children }: { children: ReactNode }) => <span className="rounded bg-panel3 px-1.5 py-0.5 font-medium text-ink">{children}</span>

export const TOPICS: Record<HelpTopic, { title: string; icon: LucideIcon; body: ReactNode }> = {
  sommaire: {
    title: 'Sommaire et table des matières', icon: ListOrdered, body: (
      <div className="space-y-4">
        <p>EDICREA crée automatiquement la liste des chapitres avec leurs numéros de page. Elle se met à jour toute seule à chaque modification du texte ou de la mise en page.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3"><b>Sommaire</b><p className="mt-1 text-[12.5px] text-muted">Placé <b>au début</b> du livre. Usage courant pour les essais, manuels, rapports et magazines.</p></div>
          <div className="rounded-lg border border-line p-3"><b>Table des matières</b><p className="mt-1 text-[12.5px] text-muted">Placée <b>à la fin</b> du livre. Usage traditionnel de l’édition française pour les romans.</p></div>
        </div>
        <h4 className="font-semibold">1. Préparer les titres (étape 3 · Composer)</h4>
        <ol className="space-y-2">
          <Step n={1}>Chaque chapitre doit être un bloc <Path>Titre 1</Path> ; les sous-parties en <Path>Titre 2</Path> et <Path>Titre 3</Path>. Cliquez l’étiquette à gauche d’un bloc (¶, T1…) pour changer son type.</Step>
          <Step n={2}>Survolez un titre : la mention <Path>Sommaire</Path> sous le titre permet de l’<b>exclure</b> (par exemple « Remerciements ») ou de lui donner un <b>libellé plus court</b> dans le sommaire.</Step>
          <Step n={3}>Le bouton <Path>Uniformiser les titres</Path> harmonise « Chapitre 1 — … » sur tout le livre.</Step>
        </ol>
        <h4 className="font-semibold">2. Régler le sommaire (étape 4 · Mise en page)</h4>
        <ol className="space-y-2">
          <Step n={1}>Section <Path>Sommaire / table des matières</Path> : activez-le et donnez-lui un titre.</Step>
          <Step n={2}><b>Position</b> : « Début » (sommaire) ou « Fin » (table des matières).</Step>
          <Step n={3}><b>Niveaux</b> : 1 = chapitres seuls, 2 = chapitres et sections, 3 = jusqu’aux sous-sections.</Step>
          <Step n={4}><b>Points de conduite</b> : points, tirets, filet ou rien entre le titre et le numéro ; vous pouvez aussi masquer les numéros.</Step>
          <Step n={5}>Vérifiez le résultat dans l’aperçu à droite ; dans le PDF interactif, chaque ligne est cliquable et des signets sont créés.</Step>
        </ol>
        <Tip>Si le sommaire est vide, c’est qu’aucun bloc n’est marqué « Titre 1 ». S’il déborde sur plusieurs pages, réduisez le nombre de niveaux ou sa taille de texte.</Tip>
      </div>
    ),
  },
  numerotation: {
    title: 'Numérotation des pages', icon: Hash, body: (
      <div className="space-y-4">
        <p>Les numéros de page (folios) se règlent dans <Path>Mise en page → Numérotation</Path>.</p>
        <ol className="space-y-2">
          <Step n={1}><b>Style</b> : 1, 2, 3 · i, ii, iii · I, II, III · a, b, c.</Step>
          <Step n={2}><b>Format</b> : <code>{'{n}'}</code> est remplacé par le numéro, <code>{'{total}'}</code> par le nombre de pages. Exemples : <code>— {'{n}'} —</code>, <code>Page {'{n}'}</code>, <code>{'{n}'} / {'{total}'}</code>.</Step>
          <Step n={3}><b>Position</b> : extérieur (à droite sur les pages de droite, à gauche sur celles de gauche), centre ou intérieur ; en bas ou en haut de page.</Step>
          <Step n={4}><b>Point de départ</b> : « Page de titre » compte la couverture intérieure comme page 1 ; « Début du texte » commence à 1 au premier chapitre. « Commencer à » choisit le premier numéro.</Step>
          <Step n={5}><b>Pages liminaires en chiffres romains</b> : titre, sommaire et préface sont numérotés i, ii, iii, puis le texte repart à 1 (usage des éditeurs).</Step>
          <Step n={6}><b>Masquer sur les ouvertures de chapitre</b> : pas de numéro sur la première page d’un chapitre, comme dans la plupart des romans.</Step>
        </ol>
        <Tip>Les pages blanches et la page de titre ne portent jamais de numéro imprimé, mais elles sont comptées.</Tip>
      </div>
    ),
  },
  veuves: {
    title: 'Veuves et orphelines', icon: AlignLeft, body: (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3"><b>Orpheline</b><p className="mt-1 text-[12.5px] text-muted">Première ligne d’un paragraphe restée <b>seule en bas</b> d’une page ou d’une colonne.</p></div>
          <div className="rounded-lg border border-line p-3"><b>Veuve</b><p className="mt-1 text-[12.5px] text-muted">Dernière ligne d’un paragraphe rejetée <b>seule en haut</b> de la page suivante.</p></div>
        </div>
        <p>Les deux sont des défauts typographiques que les maquettistes corrigent systématiquement. EDICREA les évite automatiquement pendant la pagination.</p>
        <ol className="space-y-2">
          <Step n={1}>Dans <Path>Mise en page → Veuves et orphelines</Path>, choisissez le <b>minimum de lignes en bas de page</b> (orphelines) et <b>en haut de page</b> (veuves). 2 est la norme ; 3 pour un rendu très soigné ; 1 désactive le contrôle.</Step>
          <Step n={2}><b>Garder les titres avec le texte</b> : un titre n’est jamais laissé seul en bas de page.</Step>
          <Step n={3}>Le nombre de corrections effectuées s’affiche sous l’aperçu.</Step>
        </ol>
        <Tip>Un contrôle strict peut laisser un peu de blanc en bas de certaines pages : c’est normal, c’est le prix d’un gris typographique régulier.</Tip>
      </div>
    ),
  },
  format: {
    title: 'Format et dimensions du livre', icon: Ruler, body: (
      <div className="space-y-4">
        <ol className="space-y-2">
          <Step n={1}>Choisissez un format dans la liste (roman, poche, A5, formats Amazon KDP, manuel, album jeunesse…).</Step>
          <Step n={2}>Ou saisissez une <b>largeur</b> et une <b>hauteur</b> libres, dans l’unité de votre choix : mm, cm, pouces ou points.</Step>
          <Step n={3}>Le bouton <Path>⇄</Path> passe du portrait au paysage (à l’italienne).</Step>
          <Step n={4}><Path>Enregistrer ce format</Path> l’ajoute à « Mes formats » pour vos prochains livres.</Step>
        </ol>
        <Tip>Demandez toujours à votre imprimeur ses formats standard : un format sur mesure peut coûter plus cher.</Tip>
      </div>
    ),
  },
  dos: {
    title: 'Dos de couverture', icon: BookMarked, body: (
      <div className="space-y-4">
        <p>La largeur du dos dépend du <b>nombre de pages</b> et de l’<b>épaisseur du papier</b>. Elle se règle à l’étape <Path>5 · Couverture</Path>, bloc « Gabarit de couverture ».</p>
        <ol className="space-y-2">
          <Step n={1}><b>Automatique</b> : choisissez le papier (bouffant 80 g, offset, couché, KDP…). Le nombre de pages vient de la mise en page ; vous pouvez le forcer.</Step>
          <Step n={2}><b>Manuel</b> : saisissez la largeur exacte fournie par votre imprimeur (au dixième de millimètre).</Step>
          <Step n={3}>Le schéma indique chaque zone avec sa cote. Dans l’éditeur, les repères bleus marquent les plis du dos.</Step>
          <Step n={4}>Après un changement de dimensions, cliquez <Path>Appliquer au design</Path> : la couverture est réajustée sans perdre votre travail.</Step>
        </ol>
        <Tip>En dessous de 6 mm environ, évitez de mettre du texte sur le dos : le pli risque de le couper.</Tip>
      </div>
    ),
  },
  rabats: {
    title: 'Couverture à rabats', icon: PanelLeftOpen, body: (
      <div className="space-y-4">
        <p>Les rabats sont des volets repliés à l’intérieur de la couverture, à gauche de la 4ᵉ et à droite de la 1ʳᵉ.</p>
        <ol className="space-y-2">
          <Step n={1}>Étape <Path>5 · Couverture</Path> → « Gabarit de couverture » : activez <b>Rabats</b> et indiquez leur largeur (souvent 60 à 80 % de la largeur du livre).</Step>
          <Step n={2}>Le gabarit devient : rabat arrière · 4ᵉ · dos · 1ʳᵉ · rabat avant, avec les fonds perdus autour.</Step>
          <Step n={3}>Dans l’éditeur, les repères verts marquent les plis des rabats ; des zones « Biographie de l’auteur » et « Présentation » sont prêtes à remplir.</Step>
          <Step n={4}>Comme pour le dos, <Path>Appliquer au design</Path> réajuste une couverture existante.</Step>
        </ol>
      </div>
    ),
  },
  gabarits: {
    title: 'Gabarits de mise en page', icon: LayoutTemplate, body: (
      <div className="space-y-4">
        <p>Un gabarit mémorise <b>toute</b> la mise en page : format, marges, colonnes, styles de texte, en-têtes, numérotation, sommaire, veuves et orphelines.</p>
        <ol className="space-y-2">
          <Step n={1}>Section <Path>Gabarits</Path> en haut du panneau Mise en page : appliquez un gabarit intégré (roman, essai, manuel, magazine, jeunesse, rapport).</Step>
          <Step n={2}>Ajustez ce que vous voulez, puis <Path>Enregistrer comme gabarit</Path> : il rejoint « Mes gabarits ».</Step>
          <Step n={3}>Vos gabarits se renomment, se mettent à jour avec la mise en page actuelle ou se suppriment ; ils sont aussi visibles dans <Path>Mes modèles</Path>.</Step>
          <Step n={4}>Appliquer un gabarit crée d’abord une version de sauvegarde : vous pouvez revenir en arrière avec <Path>Versions</Path> ou Ctrl Z.</Step>
        </ol>
      </div>
    ),
  },
  typo: {
    title: 'Typographie du titre', icon: Type, body: (
      <div className="space-y-4">
        <ol className="space-y-2">
          <Step n={1}>Étape <Path>5 · Couverture</Path> → « Typographie du titre » : police (plus de 20 polices de titre), graisse, casse, interlettrage, interlignage, taille, couleur et effet.</Step>
          <Step n={2}>Les effets prêts à l’emploi : doré, contour, ombre portée, néon, relief, dégradé.</Step>
          <Step n={3}>Ces réglages s’appliquent aux 4 propositions générées, et <Path>Appliquer au design</Path> les reporte sur la couverture en cours.</Step>
          <Step n={4}>Dans l’éditeur, sélectionnez le titre : le panneau Typographie offre en plus les styles de titre, le crénage lettre par lettre et le texte sur tracé.</Step>
          <Step n={5}>Vos propres polices s’importent dans <Path>Bibliothèque → Polices</Path>.</Step>
        </ol>
      </div>
    ),
  },
  libre: {
    title: 'Créer une couverture librement', icon: PenTool, body: (
      <div className="space-y-4">
        <ol className="space-y-2">
          <Step n={1}>Étape <Path>5 · Couverture</Path> : cliquez <Path>Page blanche</Path> au lieu de générer des propositions.</Step>
          <Step n={2}>Vous obtenez le gabarit exact (4ᵉ, dos, 1ʳᵉ, rabats éventuels, fonds perdus) avec les zones repérées, sans aucun élément imposé.</Step>
          <Step n={3}>Dessinez avec tous les outils du studio : formes, plume, images, textes, calques, dégradés, retouche photo, images générées si vous le souhaitez.</Step>
          <Step n={4}>Enregistrez votre création comme <Path>Modèle</Path> pour la réutiliser sur d’autres livres.</Step>
        </ol>
      </div>
    ),
  },
}

export function HelpButton({ topic, label }: { topic: HelpTopic; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline" data-tip={label ? undefined : 'Aide'} onClick={(e) => { e.stopPropagation(); setOpen(true) }}><HelpCircle size={13} />{label}</button>
      {open && <HelpDialog topic={topic} onClose={() => setOpen(false)} />}
    </>
  )
}

export function HelpDialog({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) {
  const [t, setT] = useState<HelpTopic>(topic)
  const T = TOPICS[t]
  return (
    <Modal title={T.title} icon={T.icon} wide onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="space-y-px max-md:hidden">
          {(Object.keys(TOPICS) as HelpTopic[]).map((k) => { const X = TOPICS[k]; return (
            <button key={k} onClick={() => setT(k)} className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${t === k ? 'bg-panel3 font-medium' : 'text-muted hover:bg-panel2 hover:text-ink'}`}><X.icon size={14} />{X.title}</button>
          ) })}
        </nav>
        <div className="text-[13.5px] leading-relaxed">{T.body}</div>
      </div>
    </Modal>
  )
}

export function HelpPage() {
  const [open, setOpen] = useState<HelpTopic | null>(null)
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6"><div className="eyebrow mb-1.5">Aide</div><h1 className="text-[24px] font-semibold tracking-tight">Guides et tutoriels</h1><p className="mt-1 text-[13.5px] text-muted">Toutes les fonctions de mise en page et de couverture, expliquées pas à pas.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(TOPICS) as HelpTopic[]).map((k) => { const X = TOPICS[k]; return (
          <button key={k} onClick={() => setOpen(k)} className="card flex items-start gap-3 p-4 text-left transition hover:border-accent/60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><X.icon size={17} /></span>
            <span><span className="block font-semibold">{X.title}</span><span className="mt-0.5 block text-[12px] text-muted">Lire le guide</span></span>
          </button>
        ) })}
      </div>
      {open && <HelpDialog topic={open} onClose={() => setOpen(null)} />}
      <BookOpen className="hidden" />
    </div>
  )
}
