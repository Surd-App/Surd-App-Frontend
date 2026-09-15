import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  readGitHubSyncSettings,
  resolveGitHubRemoteChange,
  subscribeGitHubSyncDataChanges,
  synchronizeGitHubData,
  type GitHubSyncPhase,
} from '../utils/githubSync';

export const useGitHubSyncStore = defineStore('github-sync', () => {
  const enabled = ref(false);
  const phase = ref<GitHubSyncPhase>('idle');
  const error = ref('');
  const lastSyncedAt = ref(0);
  const running = ref(false);
  const pending = ref(false);
  const remoteChangePending = ref(false);
  let initialized = false;
  let debounceTimer: number | undefined;
  let unsubscribe: (() => void) | undefined;

  const status = computed(() => {
    if (!navigator.onLine) return 'offline';
    if (error.value) return 'error';
    if (remoteChangePending.value) return 'attention';
    if (phase.value !== 'idle') return phase.value;
    if (pending.value) return 'pending';
    return 'idle';
  });

  async function syncNow() {
    if (!enabled.value || running.value || remoteChangePending.value || !navigator.onLine || document.visibilityState === 'hidden') return;
    running.value = true;
    pending.value = false;
    error.value = '';
    try {
      const result = await synchronizeGitHubData(value => { phase.value = value; });
      lastSyncedAt.value = result.lastSyncedAt;
      remoteChangePending.value = result.remoteChanged;
    } catch (cause) {
      phase.value = 'idle';
      error.value = cause instanceof Error ? cause.message : 'GitHub 云同步失败';
    } finally {
      running.value = false;
      if (pending.value) scheduleUpload();
    }
  }

  async function resolveRemoteChange(strategy: 'local' | 'cloud') {
    if (running.value) return;
    running.value = true;
    error.value = '';
    try {
      const result = await resolveGitHubRemoteChange(strategy, value => { phase.value = value; });
      lastSyncedAt.value = result.lastSyncedAt;
      remoteChangePending.value = false;
      pending.value = false;
      if (result.dataApplied) {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        window.location.replace(`${base}/`);
      }
    } catch (cause) {
      phase.value = 'idle';
      error.value = cause instanceof Error ? cause.message : 'GitHub 云同步失败';
    } finally {
      running.value = false;
    }
  }

  function scheduleUpload() {
    if (!enabled.value) return;
    pending.value = true;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void syncNow();
    }, 3000);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void syncNow();
  }

  function startListeners() {
    if (unsubscribe) return;
    unsubscribe = subscribeGitHubSyncDataChanges(scheduleUpload);
    window.addEventListener('online', syncNow);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 60000);
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    const settings = await readGitHubSyncSettings();
    enabled.value = settings.enabled;
    if (!enabled.value) return;
    startListeners();
    void syncNow();
  }

  function activate(lastSync: number) {
    enabled.value = true;
    lastSyncedAt.value = lastSync;
    error.value = '';
    remoteChangePending.value = false;
    startListeners();
  }

  function deactivate() {
    enabled.value = false;
    pending.value = false;
    phase.value = 'idle';
    error.value = '';
    remoteChangePending.value = false;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }

  return { enabled, phase, status, error, lastSyncedAt, remoteChangePending, initialize, activate, deactivate, syncNow, resolveRemoteChange };
});
