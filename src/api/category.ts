import { useCategoryStore } from '../store/category';
import type { Category } from './types';

export async function getCategories(): Promise<Category[]> {
  const store = useCategoryStore();
  await store.initialize();
  return store.roots;
}
