import { openDatabase } from './database';
import { notifyGitHubSyncDataChanged } from './githubSync';

export interface LastPracticeProgress {
  version: 1;
  bankId: string;
  categoryId: number;
  questionId: number;
  questionNumber: number;
  updatedAt: number;
}

const progressKey = (bankId: string) => `lastPractice:${bankId}`;

export async function readLastPracticeProgress(bankId: string): Promise<LastPracticeProgress | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(progressKey(bankId));
    request.onsuccess = () => {
      const value = request.result as LastPracticeProgress | undefined;
      resolve(value?.version === 1 && value.bankId === bankId ? value : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLastPracticeProgress(
  progress: Omit<LastPracticeProgress, 'version' | 'updatedAt'>,
): Promise<void> {
  const db = await openDatabase();
  const value: LastPracticeProgress = { ...progress, version: 1, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, progressKey(progress.bankId));
    tx.oncomplete = () => {
      notifyGitHubSyncDataChanged();
      resolve();
    };
    tx.onabort = () => reject(tx.error ?? new Error('练习进度保存失败'));
    tx.onerror = () => reject(tx.error);
  });
}
