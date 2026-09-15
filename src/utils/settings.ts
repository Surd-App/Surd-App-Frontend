import { openDatabase } from './database';
import { notifyGitHubSyncDataChanged } from './githubSync';

/** settings/personalization is device-wide, independent of the active question bank. */
export interface PersonalizationSettings {
  version: 1;
  background: {
    type: 'solid' | 'image' | 'bing';
    image: Blob | null;
    imageName: string;
  };
}

export const defaultPersonalization = (): PersonalizationSettings => ({
  version: 1,
  background: { type: 'solid', image: null, imageName: '' },
});

export async function readPersonalization(): Promise<PersonalizationSettings> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get('personalization');
    request.onsuccess = () => resolve(request.result ?? defaultPersonalization());
    request.onerror = () => reject(request.error);
  });
}

export async function savePersonalization(settings: PersonalizationSettings): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(settings, 'personalization');
    tx.oncomplete = () => {
      notifyGitHubSyncDataChanged();
      resolve();
    };
    tx.onabort = () => reject(tx.error ?? new Error('背景设置保存失败'));
    tx.onerror = () => reject(tx.error);
  });
}
