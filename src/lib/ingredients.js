export const CATEGORY_ORDER = [
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'bakery',
  'frozen',
  'pantry',
  'other',
]

export const CATEGORY_LABELS = {
  produce: 'Produce',
  meat_seafood: 'Meat & Seafood',
  dairy_eggs: 'Dairy & Eggs',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry',
  other: 'Other',
}

export function ingName(ing) {
  if (typeof ing === 'string') return ing
  return ing?.name ?? ''
}

export function ingCategory(ing) {
  if (typeof ing === 'string') return 'other'
  const cat = ing?.category
  return CATEGORY_ORDER.includes(cat) ? cat : 'other'
}
