import { defineStore } from 'pinia';
import type { Category } from '../api/types';
import { downloadBank, readBank, readStates, type BankImportConflictStrategy, type LocalBank } from '../utils/questionBank';

export interface CategoryMeta {
  syncTime: number;
  totalQuestions: number;
  topLevelNames: string[];
  categoryIds: number[];
}

export const useCategoryStore = defineStore('category', {
  state: () => ({
    meta: null as CategoryMeta | null,
    roots: [] as Category[],
    sourceUrl: '',
    bankName: '',
    initialized: false,
    showSync: false,
    showBankSwitcher: false,
    loading: false,
    syncProgress: 0,
    syncStatus: '',
  }),
  actions: {
    async loadBank(bank: LocalBank) {
      const states = await readStates(bank.manifest.questionBank.id);
      const nodes = new Map<number, Category>();
      for (const category of bank.categories) {
        const completed = category.questionIds.filter(id => states[id]?.is_mastered).length;
        nodes.set(category.id, {
          id: category.id, parent_id: category.parentId, name: category.name,
          path: '', depth: 0, display_order: category.sortOrder,
          question_count: category.questionIds.length, completed_count: completed,
          total_question_count: category.questionIds.length, total_completed_count: completed,
          children: [],
        });
      }
      for (const node of nodes.values()) {
        if (node.parent_id !== null) nodes.get(node.parent_id)?.children.push(node);
      }
      const roots = bank.manifest.questionBank.rootCategoryIds.map(id => nodes.get(id)).filter((node): node is Category => !!node);
      const aggregate = (node: Category, depth: number, path: string) => {
        node.depth = depth;
        node.path = path ? `${path}/${node.name}` : node.name;
        node.children.sort((a, b) => a.display_order - b.display_order);
        for (const child of node.children) {
          aggregate(child, depth + 1, node.path);
          node.total_question_count += child.total_question_count;
          node.total_completed_count += child.total_completed_count;
        }
      };
      roots.forEach(root => aggregate(root, 0, ''));
      this.roots = roots;
      this.sourceUrl = bank.sourceUrl;
      this.bankName = bank.displayName || bank.manifest.questionBank.name;
      this.meta = {
        syncTime: bank.syncTime, totalQuestions: bank.questions.length,
        topLevelNames: roots.map(root => root.name), categoryIds: roots.map(root => root.id),
      };
    },
    async initialize() {
      if (this.initialized) return;
      const bank = await readBank();
      if (bank) await this.loadBank(bank);
      this.initialized = true;
    },
    async fetchAndSync(url: string, name: string, conflictStrategy?: BankImportConflictStrategy) {
      if (this.loading) return;
      this.loading = true;
      this.syncProgress = 0;
      try {
        const bank = await downloadBank(url, (percent, status) => {
          this.syncProgress = percent;
          this.syncStatus = status;
        }, name, conflictStrategy);
        await this.loadBank(bank);
        this.initialized = true;
      } finally {
        this.loading = false;
      }
    },
    getCategoryData(id: number): Category | null {
      return this.findCategoryPath(id).at(-1) ?? null;
    },
    findCategoryPath(id: number): Category[] {
      const find = (node: Category, path: Category[]): Category[] | null => {
        if (node.id === id) return [...path, node];
        for (const child of node.children) {
          const result = find(child, [...path, node]);
          if (result) return result;
        }
        return null;
      };
      for (const root of this.roots) {
        const result = find(root, []);
        if (result) return result;
      }
      return [];
    },
    updateCategoryCounts(categoryId: number, delta: number) {
      const path = this.findCategoryPath(categoryId);
      for (const node of path) node.total_completed_count = Math.max(0, node.total_completed_count + delta);
      const leaf = path.at(-1);
      if (leaf) leaf.completed_count = Math.max(0, leaf.completed_count + delta);
    },
  },
});
