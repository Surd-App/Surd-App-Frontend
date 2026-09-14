let database: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('daguan-question-bank', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['bank', 'bankCatalog', 'states', 'settings']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
      const tx = request.transaction!;
      const bankStore = tx.objectStore('bank');
      const legacy = bankStore.get('active');
      legacy.onsuccess = () => {
        const bank = legacy.result;
        if (!bank) return;
        const id = bank.manifest.questionBank.id || `legacy:${bank.sourceUrl}`;
        bank.manifest.questionBank.id = id;
        bank.displayName = bank.manifest.questionBank.name || '我的题库';
        bankStore.delete('active');
        bankStore.put(bank, id);
        tx.objectStore('bankCatalog').put({ id, name: bank.displayName,
          questionCount: bank.questions.length, syncTime: bank.syncTime, sourceUrl: bank.sourceUrl }, id);
        tx.objectStore('settings').put({ version: 1, bankId: id }, 'currentBank');
      };
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => {
      database = undefined;
      reject(new Error('请关闭其他打开的 Surd 无理页面后刷新，以完成本地存储升级'));
      request.onsuccess = () => request.result.close();
    };
  });
}
