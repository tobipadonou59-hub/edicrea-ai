import { Upload, SpellCheck, ListTree, Columns3, BookMarked, PackageCheck } from 'lucide-react'

export const STEPS = [
  { label: 'Importer', desc: 'Manuscrit et informations', icon: Upload },
  { label: 'Corriger', desc: 'Orthographe, style, cohérence', icon: SpellCheck },
  { label: 'Composer', desc: 'Structure et styles', icon: ListTree },
  { label: 'Mise en page', desc: 'Format, marges, pagination', icon: Columns3 },
  { label: 'Couverture', desc: '1ʳᵉ, dos et 4ᵉ', icon: BookMarked },
  { label: 'Finaliser', desc: 'Contrôle et export', icon: PackageCheck },
]
