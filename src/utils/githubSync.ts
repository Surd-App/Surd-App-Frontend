import { openDatabase } from './database';

const CONFIG_KEY = 'githubSync';
const CRYPTO_KEY = 'githubSyncKey';
const META_KEY = 'githubSyncMeta';
const REPOSITORY_NAME = 'Surd-App-Sync';
const SYNC_FILE = 'surd-sync.json';
const SYNC_EVENT = 'surd-github-sync-change';
const protectedSettingKeys = new Set([CONFIG_KEY, CRYPTO_KEY, META_KEY, 'currentBank']);

type SyncStoreName = 'states' | 'settings';
type SerializedValue = null | boolean | number | string | SerializedValue[] | { [key: string]: SerializedValue };
export type MergePreference = 'local' | 'cloud';
export type InitialSyncMode = 'local' | 'cloud' | 'merge';
export type GitHubSyncPhase = 'idle' | 'uploading' | 'downloading' | 'merging';

interface EncryptedToken {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

interface StoredGitHubSyncSettings {
  version: 1;
  enabled: boolean;
  account: string;
  repository: string;
  token: EncryptedToken;
  updatedAt: number;
}

interface SyncSnapshot {
  schemaVersion: 1;
  updatedAt: string;
  deviceId: string;
  stores: Record<SyncStoreName, Record<string, SerializedValue>>;
}

interface StoredSyncMeta {
  version: 1;
  deviceId: string;
  lastRemoteSha: string;
  lastSyncedAt: number;
  mergePreference: MergePreference;
  baseSnapshot: SyncSnapshot;
}

interface RemoteSnapshot {
  sha: string;
  snapshot: SyncSnapshot;
}

export interface GitHubSyncSettings {
  enabled: boolean;
  account: string;
  repository: string;
  hasToken: boolean;
}

export interface GitHubTokenTestResult {
  account: string;
  repository: string;
}

export interface GitHubSyncInspection {
  remoteExists: boolean;
  remoteUpdatedAt: string | null;
}

export interface GitHubSyncRunResult {
  dataApplied: boolean;
  lastSyncedAt: number;
  remoteChanged: boolean;
}

export interface GitHubSyncInitializationResult extends GitHubSyncRunResult {
  settings: GitHubSyncSettings;
}

export const defaultGitHubSyncSettings = (): GitHubSyncSettings => ({
  enabled: false,
  account: '',
  repository: REPOSITORY_NAME,
  hasToken: false,
});

const changeTarget = new EventTarget();
const changeChannel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(SYNC_EVENT);

export function notifyGitHubSyncDataChanged() {
  changeTarget.dispatchEvent(new Event(SYNC_EVENT));
  changeChannel?.postMessage('changed');
}

export function subscribeGitHubSyncDataChanges(listener: () => void) {
  const localListener = () => listener();
  const channelListener = () => listener();
  changeTarget.addEventListener(SYNC_EVENT, localListener);
  changeChannel?.addEventListener('message', channelListener);
  return () => {
    changeTarget.removeEventListener(SYNC_EVENT, localListener);
    changeChannel?.removeEventListener('message', channelListener);
  };
}

function isCryptoKey(value: unknown): value is CryptoKey {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CryptoKey>;
  return typeof candidate.type === 'string'
    && typeof candidate.extractable === 'boolean'
    && !!candidate.algorithm
    && Array.isArray(candidate.usages);
}

function isPlainObject(value: unknown): value is Record<string, SerializedValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createDeviceId() {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSyncableSettingKey(key: string) {
  return !protectedSettingKeys.has(key);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function serializeValue(value: unknown): Promise<SerializedValue> {
  if (value instanceof Blob) {
    return {
      __surdType: 'blob',
      type: value.type,
      base64: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
    };
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) return Promise.all(value.map(serializeValue));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await serializeValue(item)] as const));
    return Object.fromEntries(entries);
  }
  throw new Error('本地数据中包含暂不支持同步的内容');
}

async function deserializeValue(value: SerializedValue): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(deserializeValue));
  if (isPlainObject(value)) {
    if (value.__surdType === 'blob' && typeof value.type === 'string' && typeof value.base64 === 'string') {
      return new Blob([base64ToBytes(value.base64)], { type: value.type });
    }
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await deserializeValue(item)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function storesEqual(left: SyncSnapshot, right: SyncSnapshot) {
  return stableStringify(left.stores) === stableStringify(right.stores);
}

const absent = Symbol('absent');
type MergeValue = SerializedValue | typeof absent;

function valuesEqual(left: MergeValue, right: MergeValue) {
  if (left === absent || right === absent) return left === right;
  return stableStringify(left) === stableStringify(right);
}

function mergeValue(base: MergeValue, local: MergeValue, cloud: MergeValue, preference: MergePreference): MergeValue {
  if (valuesEqual(local, cloud)) return local;
  if (valuesEqual(local, base)) return cloud;
  if (valuesEqual(cloud, base)) return local;

  const localObject = local !== absent && isPlainObject(local);
  const cloudObject = cloud !== absent && isPlainObject(cloud);
  if (localObject && cloudObject) {
    const baseObject = base !== absent && isPlainObject(base) ? base : {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(local), ...Object.keys(cloud)]);
    const entries: Array<[string, SerializedValue]> = [];
    for (const key of keys) {
      const result = mergeValue(
        Object.prototype.hasOwnProperty.call(baseObject, key) ? baseObject[key]! : absent,
        Object.prototype.hasOwnProperty.call(local, key) ? local[key]! : absent,
        Object.prototype.hasOwnProperty.call(cloud, key) ? cloud[key]! : absent,
        preference,
      );
      if (result !== absent) entries.push([key, result]);
    }
    return Object.fromEntries(entries);
  }
  return preference === 'local' ? local : cloud;
}

function emptySnapshot(deviceId: string): SyncSnapshot {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    deviceId,
    stores: { states: {}, settings: {} },
  };
}

function mergeSnapshots(base: SyncSnapshot, local: SyncSnapshot, cloud: SyncSnapshot, preference: MergePreference): SyncSnapshot {
  const stores = mergeValue(base.stores, local.stores, cloud.stores, preference);
  if (stores === absent || !isPlainObject(stores)) throw new Error('同步数据合并失败');
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    deviceId: local.deviceId,
    stores: stores as SyncSnapshot['stores'],
  };
}

async function readStore(name: SyncStoreName) {
  const db = await openDatabase();
  const entries = await new Promise<Array<[string, unknown]>>((resolve, reject) => {
    const tx = db.transaction(name);
    const store = tx.objectStore(name);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    tx.oncomplete = () => resolve(keysRequest.result.map((key, index) => [String(key), valuesRequest.result[index]]));
    tx.onabort = () => reject(tx.error ?? new Error('本地同步数据读取失败'));
    tx.onerror = () => reject(tx.error);
  });
  const serialized = await Promise.all(entries
    .filter(([key]) => name === 'states' ? key.startsWith('bank:') : isSyncableSettingKey(key))
    .map(async ([key, value]) => [key, await serializeValue(value)] as const));
  return Object.fromEntries(serialized);
}

async function readLocalSnapshot(deviceId: string): Promise<SyncSnapshot> {
  const [states, settings] = await Promise.all([readStore('states'), readStore('settings')]);
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    deviceId,
    stores: { states, settings },
  };
}

async function applySnapshot(snapshot: SyncSnapshot) {
  const decoded = await Promise.all((['states', 'settings'] as const).map(async name => {
    const entries = await Promise.all(Object.entries(snapshot.stores[name])
      .filter(([key]) => name === 'states' ? key.startsWith('bank:') : isSyncableSettingKey(key))
      .map(async ([key, value]) => [key, await deserializeValue(value)] as const));
    return [name, entries] as const;
  }));
  const db = await openDatabase();
  const currentSettingKeys = await new Promise<string[]>((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').getAllKeys();
    request.onsuccess = () => resolve(request.result.map(String));
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['states', 'settings'], 'readwrite');
    tx.objectStore('states').clear();
    for (const key of currentSettingKeys) {
      if (isSyncableSettingKey(key)) tx.objectStore('settings').delete(key);
    }
    for (const [name, entries] of decoded) {
      const store = tx.objectStore(name);
      for (const [key, value] of entries) store.put(value, key);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('云端数据写入本地失败'));
    tx.onerror = () => reject(tx.error);
  });
}

async function readStoredConfig(): Promise<StoredGitHubSyncSettings | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(CONFIG_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSyncMeta(): Promise<StoredSyncMeta | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(META_KEY);
    request.onsuccess = () => resolve(request.result?.version === 1 ? request.result : undefined);
    request.onerror = () => reject(request.error);
  });
}

async function saveSyncMeta(meta: StoredSyncMeta) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(meta, META_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('同步状态保存失败'));
    tx.onerror = () => reject(tx.error);
  });
}

async function getEncryptionKey(): Promise<CryptoKey | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(CRYPTO_KEY);
    request.onsuccess = () => resolve(isCryptoKey(request.result) ? request.result : undefined);
    request.onerror = () => reject(request.error);
  });
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const existing = await getEncryptionKey();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(key, CRYPTO_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Token 加密密钥保存失败'));
    tx.onerror = () => reject(tx.error);
  });
  return key;
}

async function decryptStoredToken(config: StoredGitHubSyncSettings) {
  const key = await getEncryptionKey();
  if (!key) throw new Error('Token 加密密钥不存在，请重新配置 GitHub 云同步');
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: config.token.iv }, key, config.token.ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Token 无法解密，请重新配置 GitHub 云同步');
  }
}

export async function readGitHubSyncSettings(): Promise<GitHubSyncSettings> {
  const value = await readStoredConfig();
  if (!value || value.version !== 1) return defaultGitHubSyncSettings();
  return {
    enabled: value.enabled,
    account: value.account,
    repository: value.repository,
    hasToken: !!value.token?.iv && !!value.token?.ciphertext,
  };
}

export async function saveGitHubSyncSettings(token: string, account: string, repository: string): Promise<GitHubSyncSettings> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  const value: StoredGitHubSyncSettings = {
    version: 1,
    enabled: true,
    account,
    repository,
    token: { iv: iv.buffer, ciphertext },
    updatedAt: Date.now(),
  };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, CONFIG_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('GitHub 云同步设置保存失败'));
    tx.onerror = () => reject(tx.error);
  });
  return { enabled: true, account, repository, hasToken: true };
}

export async function disableGitHubSync(): Promise<GitHubSyncSettings> {
  const stored = await readStoredConfig();
  if (!stored) return defaultGitHubSyncSettings();
  const next = { ...stored, enabled: false, updatedAt: Date.now() };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(next, CONFIG_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('GitHub 云同步设置保存失败'));
    tx.onerror = () => reject(tx.error);
  });
  return { enabled: false, account: stored.account, repository: stored.repository, hasToken: true };
}

async function githubRequest(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

function repositoryPath(repository: string) {
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error('GitHub 仓库地址无效');
  return parts.map(encodeURIComponent).join('/');
}

function validateSnapshot(value: unknown): SyncSnapshot {
  if (!value || typeof value !== 'object') throw new Error('云端同步文件格式无效');
  const snapshot = value as Partial<SyncSnapshot>;
  if (snapshot.schemaVersion !== 1 || typeof snapshot.updatedAt !== 'string' || typeof snapshot.deviceId !== 'string'
    || !snapshot.stores || !isPlainObject(snapshot.stores.states) || !isPlainObject(snapshot.stores.settings)) {
    throw new Error('云端同步文件版本或格式不受支持');
  }
  return snapshot as SyncSnapshot;
}

async function readRemoteSnapshot(token: string, repository: string): Promise<RemoteSnapshot | null> {
  const repositoryUrl = repositoryPath(repository);
  const response = await githubRequest(`/repos/${repositoryUrl}/contents/${SYNC_FILE}`, token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`云端同步数据读取失败（${response.status}）`);
  const content = await response.json() as { sha?: string; content?: string };
  if (!content.sha) throw new Error('无法读取云端同步文件版本');
  let encoded = content.content;
  if (!encoded) {
    const blobResponse = await githubRequest(`/repos/${repositoryUrl}/git/blobs/${content.sha}`, token);
    if (!blobResponse.ok) throw new Error(`云端同步数据读取失败（${blobResponse.status}）`);
    encoded = (await blobResponse.json() as { content?: string }).content;
  }
  if (!encoded) throw new Error('云端同步文件内容为空');
  try {
    const text = new TextDecoder().decode(base64ToBytes(encoded));
    return { sha: content.sha, snapshot: validateSnapshot(JSON.parse(text)) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('云端同步文件')) throw error;
    throw new Error('云端同步文件无法解析');
  }
}

class GitHubWriteConflictError extends Error {}

async function writeRemoteSnapshot(token: string, repository: string, snapshot: SyncSnapshot, sha?: string) {
  const response = await githubRequest(`/repos/${repositoryPath(repository)}/contents/${SYNC_FILE}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Sync Surd user data',
      content: bytesToBase64(new TextEncoder().encode(JSON.stringify(snapshot))),
      ...(sha ? { sha } : {}),
    }),
  });
  if (response.status === 409 || response.status === 422) throw new GitHubWriteConflictError('云端数据已发生变化');
  if (!response.ok) throw new Error(`云端同步数据写入失败（${response.status}）`);
  const result = await response.json() as { content?: { sha?: string } };
  if (!result.content?.sha) throw new Error('无法读取写入后的云端版本');
  return result.content.sha;
}

export async function testGitHubToken(token: string): Promise<GitHubTokenTestResult> {
  const userResponse = await githubRequest('/user', token);
  if (userResponse.status === 401) throw new Error('Token 无效或已过期');
  if (!userResponse.ok) throw new Error(`GitHub 身份验证失败（${userResponse.status}）`);
  const user = await userResponse.json() as { login?: string };
  if (!user.login) throw new Error('无法读取 GitHub 账户信息');

  let page = 1;
  while (page <= 10) {
    const repositoriesResponse = await githubRequest(
      `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`,
      token,
    );
    if (!repositoriesResponse.ok) throw new Error(`仓库访问测试失败（${repositoriesResponse.status}）`);
    const repositories = await repositoriesResponse.json() as Array<{
      name?: string;
      full_name?: string;
      permissions?: { push?: boolean };
    }>;
    const repository = repositories.find(item => item.name === REPOSITORY_NAME);
    if (repository) {
      if (!repository.permissions?.push) throw new Error('Token 没有该仓库的写入权限，请将 Contents 设置为 Read and write');
      if (!repository.full_name) throw new Error('无法读取 GitHub 仓库信息');
      return { account: user.login, repository: repository.full_name };
    }
    if (repositories.length < 100) break;
    page += 1;
  }
  throw new Error(`未找到 ${REPOSITORY_NAME}，或 Token 未获得该仓库权限`);
}

export async function inspectGitHubSyncRepository(token: string, repository: string): Promise<GitHubSyncInspection> {
  const remote = await readRemoteSnapshot(token, repository);
  return { remoteExists: !!remote, remoteUpdatedAt: remote?.snapshot.updatedAt ?? null };
}

export async function initializeGitHubSync(
  token: string,
  account: string,
  repository: string,
  mode: InitialSyncMode,
  preference: MergePreference,
): Promise<GitHubSyncInitializationResult> {
  const previousMeta = await readSyncMeta();
  const deviceId = previousMeta?.deviceId ?? createDeviceId();
  const local = await readLocalSnapshot(deviceId);
  const remote = await readRemoteSnapshot(token, repository);
  let finalSnapshot = local;
  let remoteSha = remote?.sha;
  let dataApplied = false;

  if (mode === 'cloud') {
    if (!remote) throw new Error('云端还没有同步数据，不能覆盖本地数据');
    finalSnapshot = { ...remote.snapshot, deviceId };
  } else if (mode === 'merge' && remote) {
    finalSnapshot = mergeSnapshots(emptySnapshot(deviceId), local, remote.snapshot, preference);
  }

  try {
    if (!storesEqual(local, finalSnapshot)) {
      await applySnapshot(finalSnapshot);
      dataApplied = true;
    }
    if (mode !== 'cloud' && (!remote || !storesEqual(remote.snapshot, finalSnapshot))) {
      remoteSha = await writeRemoteSnapshot(token, repository, finalSnapshot, remote?.sha);
    }
    if (!remoteSha) throw new Error('云端同步文件尚未建立');
    const lastSyncedAt = Date.now();
    await saveSyncMeta({
      version: 1,
      deviceId,
      lastRemoteSha: remoteSha,
      lastSyncedAt,
      mergePreference: preference,
      baseSnapshot: finalSnapshot,
    });
    const settings = await saveGitHubSyncSettings(token, account, repository);
    return { settings, dataApplied, lastSyncedAt, remoteChanged: false };
  } catch (error) {
    if (dataApplied) await applySnapshot(local).catch(() => undefined);
    throw error;
  }
}

async function performAutomaticSync(report: (phase: GitHubSyncPhase) => void): Promise<GitHubSyncRunResult> {
  const config = await readStoredConfig();
  if (!config?.enabled) throw new Error('GitHub 云同步尚未启用');
  const token = await decryptStoredToken(config);
  const meta = await readSyncMeta();
  const deviceId = meta?.deviceId ?? createDeviceId();
  const local = await readLocalSnapshot(deviceId);
  const remote = await readRemoteSnapshot(token, config.repository);
  const base = meta?.baseSnapshot ?? emptySnapshot(deviceId);
  const finalSnapshot = local;
  let remoteSha = remote?.sha;
  const dataApplied = false;

  if (remote && (!meta?.lastRemoteSha || meta.lastRemoteSha !== remote.sha)) {
    report('idle');
    return { dataApplied: false, lastSyncedAt: meta?.lastSyncedAt ?? 0, remoteChanged: true };
  }

  if (!remote) {
    report('uploading');
    remoteSha = await writeRemoteSnapshot(token, config.repository, local);
  } else if (meta?.lastRemoteSha === remote.sha) {
    if (!storesEqual(local, base)) {
      report('uploading');
      remoteSha = await writeRemoteSnapshot(token, config.repository, local, remote.sha);
    }
  }

  if (!remoteSha) throw new Error('无法确定云端同步版本');
  const lastSyncedAt = Date.now();
  await saveSyncMeta({
    version: 1,
    deviceId,
    lastRemoteSha: remoteSha,
    lastSyncedAt,
    mergePreference: meta?.mergePreference ?? 'local',
    baseSnapshot: finalSnapshot,
  });
  report('idle');
  return { dataApplied, lastSyncedAt, remoteChanged: false };
}

export async function synchronizeGitHubData(report: (phase: GitHubSyncPhase) => void): Promise<GitHubSyncRunResult> {
  try {
    return await performAutomaticSync(report);
  } catch (error) {
    if (!(error instanceof GitHubWriteConflictError)) throw error;
    return performAutomaticSync(report);
  }
}

export async function resolveGitHubRemoteChange(
  strategy: 'local' | 'cloud',
  report: (phase: GitHubSyncPhase) => void,
): Promise<GitHubSyncRunResult> {
  const config = await readStoredConfig();
  if (!config?.enabled) throw new Error('GitHub 云同步尚未启用');
  const token = await decryptStoredToken(config);
  const meta = await readSyncMeta();
  const deviceId = meta?.deviceId ?? createDeviceId();
  const local = await readLocalSnapshot(deviceId);
  const remote = await readRemoteSnapshot(token, config.repository);
  if (!remote) throw new Error('云端同步文件已不存在，请重新同步');

  let finalSnapshot = local;
  let remoteSha = remote.sha;
  let dataApplied = false;
  if (strategy === 'cloud') {
    report('downloading');
    finalSnapshot = { ...remote.snapshot, deviceId };
    if (!storesEqual(local, finalSnapshot)) {
      await applySnapshot(finalSnapshot);
      dataApplied = true;
    }
  } else {
    report('uploading');
    remoteSha = await writeRemoteSnapshot(token, config.repository, local, remote.sha);
  }

  const lastSyncedAt = Date.now();
  await saveSyncMeta({
    version: 1,
    deviceId,
    lastRemoteSha: remoteSha,
    lastSyncedAt,
    mergePreference: meta?.mergePreference ?? 'local',
    baseSnapshot: finalSnapshot,
  });
  report('idle');
  return { dataApplied, lastSyncedAt, remoteChanged: false };
}
