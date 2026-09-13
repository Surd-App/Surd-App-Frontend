import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { defaultPersonalization, readPersonalization, savePersonalization } from '../utils/settings';
import type { PersonalizationSettings } from '../utils/settings';

export const useSettingsStore = defineStore('settings', () => {
  const personalization = shallowRef(defaultPersonalization());
  const imageUrl = ref('');
  const ready = ref(false);
  const saving = ref(false);
  let initialization: Promise<void> | undefined;
  const backgroundUrl = computed(() => {
    const type = personalization.value.background.type;
    if (type === 'bing') return 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
    return type === 'image' ? imageUrl.value : '';
  });

  function apply(settings: PersonalizationSettings) {
    const oldUrl = imageUrl.value;
    imageUrl.value = settings.background.image ? URL.createObjectURL(settings.background.image) : '';
    personalization.value = settings;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }

  function initialize() {
    return initialization ??= readPersonalization().then(settings => {
      apply(settings);
      ready.value = true;
    }).catch(error => {
      initialization = undefined;
      throw error;
    });
  }

  async function setBackground(type: 'solid' | 'image' | 'bing', file?: File) {
    if (saving.value) return;
    saving.value = true;
    try {
      await initialize();
      const previous = personalization.value;
      const next: PersonalizationSettings = {
        version: 1,
        background: {
          type,
          image: file ?? previous.background.image,
          imageName: file?.name ?? previous.background.imageName,
        },
      };
      await savePersonalization(next);
      apply(next);
    } finally {
      saving.value = false;
    }
  }

  return { personalization, imageUrl, backgroundUrl, ready, saving, initialize, setBackground };
});
