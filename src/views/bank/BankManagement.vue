<script setup lang="ts">
import { computed, h, onMounted, ref, shallowRef, watch } from 'vue'
import { NButton, NIcon, useMessage } from 'naive-ui'
import type { DataTableColumns, TreeOption, TreeOverrideNodeClickBehavior } from 'naive-ui'
import { AddCircleOutline, RemoveCircleOutline } from '@vicons/ionicons5'
import { Add24Regular, Code24Regular, Delete24Regular, Edit24Regular } from '@vicons/fluent'
import { createBankCategory, deleteBankCategory, readBank, renameBankCategory, type BankQuestion, type LocalBank } from '../../utils/questionBank'
import { useCategoryStore } from '../../store/category'
import type { QuestionBatchAction, QuestionBatchRequest } from '../../utils/questionBank'
import QuestionEditorDialog from './QuestionEditorDialog.vue'
import QuestionBatchDialog from './QuestionBatchDialog.vue'
import DirectoryJsonDialog from './DirectoryJsonDialog.vue'
import { useRouter } from 'vue-router'
import { ensureQuestionEntryRoute } from '../../router/questionEntry'

const router = useRouter()
const openingEntry = ref(false)

async function openQuestionEntry() {
  if (openingEntry.value) return
  openingEntry.value = true
  const target = {
    path: '/question-entry',
    query: selectedCategoryId.value === null ? {} : { categoryId: String(selectedCategoryId.value) },
  }
  try {
    ensureQuestionEntryRoute(router)
    const failure = await router.push(target)
    if (failure) message.error('未能打开题目录入页面，请重试')
  } catch (cause) {
    message.error(cause instanceof Error ? `题目录入页面加载失败：${cause.message}` : '题目录入页面加载失败，请刷新后重试')
  } finally {
    openingEntry.value = false
  }
}

const bank = shallowRef<LocalBank | null>(null)
const loading = ref(true)
const showDirectoryJson = ref(false)

function openDirectoryJson() {
  showRename.value = false
  showDirectoryJson.value = true
}

async function applyDirectoryChanges(updatedBank: LocalBank) {
  bank.value = updatedBank
  message.success('目录已合并保存')
  try {
    await categoryStore.loadBank(updatedBank)
  } catch {
    message.warning('目录已保存，导航刷新失败，请刷新页面')
  }
}
const error = ref('')
const selectedCategoryId = ref<number | null>(null)
const expandedKeys = ref<Array<string | number>>([])
const search = ref('')
const checkedQuestionIds = ref<number[]>([])
const batchRequest = ref<QuestionBatchRequest | null>(null)
const editingQuestion = shallowRef<{ bankId: string; question: BankQuestion } | null>(null)

watch([selectedCategoryId, search], () => { checkedQuestionIds.value = [] })

function editQuestion(question: BankQuestion) {
  if (!bank.value) return
  editingQuestion.value = { bankId: bank.value.manifest.questionBank.id, question }
}

function openBatchAction(action: QuestionBatchAction) {
  if (!bank.value || selectedCategoryId.value === null || !checkedQuestionIds.value.length) return
  batchRequest.value = {
    bankId: bank.value.manifest.questionBank.id,
    sourceCategoryId: selectedCategoryId.value,
    action,
    questionIds: [...checkedQuestionIds.value],
  }
}

async function applyQuestionChanges(updatedBank: LocalBank) {
  bank.value = updatedBank
  checkedQuestionIds.value = []
  if (selectedCategory.value && parentCategoryIds.value.has(selectedCategory.value.id) &&
      selectedCategory.value.questionIds.length === 0) {
    selectedCategoryId.value = null
  }
  message.success('题库修改已保存')
  try {
    await categoryStore.loadBank(updatedBank)
  } catch {
    message.warning('修改已保存，章节统计刷新失败，请刷新页面')
  }
}
const message = useMessage()
const categoryStore = useCategoryStore()
const showRename = ref(false)
const categoryName = ref('')
const renameError = ref('')
const savingName = ref(false)
const editingCategoryId = ref<number | null>(null)
const editorMode = ref<'rename' | 'create'>('rename')
const editorParentName = ref('')
const showDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')
const deleteTarget = ref<{ bankId: string; id: number; name: string } | null>(null)

function confirmDeleteCategory(id: number) {
  const currentBank = bank.value
  const category = currentBank?.categories.find(category => category.id === id)
  if (!currentBank || !category) return
  deleteTarget.value = { bankId: currentBank.manifest.questionBank.id, id, name: category.name }
  deleteError.value = ''
  showDelete.value = true
}

async function removeCategory() {
  if (deleting.value || !deleteTarget.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    const { bankId, id } = deleteTarget.value
    const updatedBank = await deleteBankCategory(bankId, id)
    bank.value = updatedBank
    const remainingIds = new Set(updatedBank.categories.map(category => category.id))
    expandedKeys.value = expandedKeys.value.filter(key => typeof key === 'number' && remainingIds.has(key))
    if (selectedCategoryId.value !== null && !remainingIds.has(selectedCategoryId.value)) {
      selectedCategoryId.value = null
      search.value = ''
    }
    showDelete.value = false
    message.success('章节及其下所有题目已删除')
    try {
      await categoryStore.loadBank(updatedBank)
    } catch {
      message.warning('章节已删除，其他章节导航刷新失败，请刷新页面')
    }
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : '章节删除失败'
  } finally {
    deleting.value = false
  }
}

const handleNodeClick: TreeOverrideNodeClickBehavior = ({ option }) =>
  option.children?.length ? 'toggleExpand' : 'toggleSelect'

function editCategoryName(id = selectedCategoryId.value) {
  const category = bank.value?.categories.find(category => category.id === id)
  if (!category) return
  editorMode.value = 'rename'
  editingCategoryId.value = category.id
  categoryName.value = category.name
  renameError.value = ''
  showRename.value = true
}

function newRootCategory() {
  editorMode.value = 'create'
  editingCategoryId.value = null
  editorParentName.value = ''
  categoryName.value = ''
  renameError.value = ''
  showRename.value = true
}

function newChildCategory(id: number) {
  const parent = bank.value?.categories.find(category => category.id === id)
  if (!parent) return
  editorMode.value = 'create'
  editingCategoryId.value = id
  editorParentName.value = parent.name
  categoryName.value = ''
  renameError.value = ''
  showRename.value = true
}

function renderChapterActions({ option }: { option: TreeOption }) {
  if (typeof option.key !== 'number') return null
  const id = option.key
  return h('span', {
    class: 'chapter-actions',
    onClick: (event: MouseEvent) => event.stopPropagation(),
    onKeydown: (event: KeyboardEvent) => event.stopPropagation(),
  }, [
    h(NButton, {
      quaternary: true, size: 'tiny', circle: true,
      title: '编辑章节名称', 'aria-label': `编辑章节：${option.label}`,
      onClick: () => editCategoryName(id),
    }, { icon: () => h(NIcon, null, { default: () => h(Edit24Regular) }) }),
    h(NButton, {
      quaternary: true, size: 'tiny', circle: true,
      title: '新建子章节', 'aria-label': `新建子章节：${option.label}`,
      onClick: () => newChildCategory(id),
    }, { icon: () => h(NIcon, null, { default: () => h(Add24Regular) }) }),
    h(NButton, {
      quaternary: true, size: 'tiny', circle: true, type: 'error',
      title: '删除章节', 'aria-label': `删除章节：${option.label}`,
      onClick: () => confirmDeleteCategory(id),
    }, { icon: () => h(NIcon, null, { default: () => h(Delete24Regular) }) }),
  ])
}

async function saveCategoryName() {
  if (savingName.value || !bank.value || (editorMode.value === 'rename' && editingCategoryId.value === null)) return
  if (!categoryName.value.trim()) {
    renameError.value = '请输入章节名称'
    return
  }

  savingName.value = true
  renameError.value = ''
  try {
    const bankId = bank.value.manifest.questionBank.id
    const targetId = editingCategoryId.value
    let updatedBank: LocalBank
    if (editorMode.value === 'create') {
      const created = await createBankCategory(bankId, targetId, categoryName.value)
      updatedBank = created.bank
      if (targetId !== null && !expandedKeys.value.includes(targetId)) expandedKeys.value.push(targetId)
      selectedCategoryId.value = created.categoryId
      search.value = ''
    } else {
      updatedBank = await renameBankCategory(bankId, targetId!, categoryName.value)
    }
    bank.value = updatedBank
    showRename.value = false
    message.success(editorMode.value === 'create' ? (targetId === null ? '一级分类已创建' : '子章节已创建') : '章节名称已保存')
    try {
      await categoryStore.loadBank(updatedBank)
    } catch {
      message.warning('章节已保存，其他章节导航刷新失败，请刷新页面')
    }
  } catch (cause) {
    renameError.value = cause instanceof Error ? cause.message : '章节保存失败'
  } finally {
    savingName.value = false
  }
}

function renderSwitcherIconWithExpaned({ expanded }: { expanded: boolean }) {
  return h(NIcon, null, {
    default: () => h(expanded ? RemoveCircleOutline : AddCircleOutline),
  })
}

const parentCategoryIds = computed(() => new Set(
  (bank.value?.categories ?? []).flatMap(category => category.parentId === null ? [] : [category.parentId]),
))

function directQuestionsKey(categoryId: number) {
  return `direct-questions:${categoryId}`
}

// 虚拟末级节点只提供直属题目的入口，不修改题库的章节结构。
const directQuestionEntries = computed(() => new Map(
  (bank.value?.categories ?? [])
    .filter(category => parentCategoryIds.value.has(category.id) && category.questionIds.length > 0)
    .map(category => [directQuestionsKey(category.id), category.id] as const),
))

const selectedTreeKeys = computed<Array<string | number>>(() => {
  const id = selectedCategoryId.value
  if (id === null) return []
  const key = directQuestionsKey(id)
  return [directQuestionEntries.value.has(key) ? key : id]
})

const categoryTree = computed<TreeOption[]>(() => {
  const categories = bank.value?.categories ?? []
  const nodes = new Map<number, TreeOption>(
    categories.map(category => [category.id, { key: category.id, label: category.name }]),
  )
  const roots: TreeOption[] = []

  for (const category of categories) {
    const node = nodes.get(category.id)!
    const parent = category.parentId === null ? undefined : nodes.get(category.parentId)
    if (parent) {
      parent.children ??= []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  for (const [key, categoryId] of directQuestionEntries.value) {
    nodes.get(categoryId)!.children!.unshift({ key, label: '本节题目', isLeaf: true })
  }
  return roots
})

const selectedCategory = computed(() =>
  bank.value?.categories.find(category => category.id === selectedCategoryId.value),
)

const categoryQuestions = computed(() => {
  const questions = bank.value?.questions ?? []
  if (!selectedCategory.value) return []

  const questionIds = new Set(selectedCategory.value.questionIds)
  return questions.filter(question => questionIds.has(question.id))
})

const filteredQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return categoryQuestions.value

  return categoryQuestions.value.filter(question =>
    `${question.contentMarkdown} ${question.answerMarkdown ?? ''}`.toLowerCase().includes(query),
  )
})

watch(filteredQuestions, rows => {
  const visibleIds = new Set(rows.map(question => question.id))
  checkedQuestionIds.value = checkedQuestionIds.value.filter(id => visibleIds.has(id))
})

function updateCheckedQuestions(keys: Array<string | number>) {
  const visibleIds = new Set(filteredQuestions.value.map(question => question.id))
  checkedQuestionIds.value = keys.filter((key): key is number => typeof key === 'number' && visibleIds.has(key))
}

const columns: DataTableColumns<BankQuestion> = [
  { type: 'selection', width: 48, fixed: 'left' },
  { title: 'ID', key: 'id', width: 100, ellipsis: { tooltip: true } },
  { title: '题目内容', key: 'contentMarkdown', ellipsis: { tooltip: true }, minWidth: 420 },
  { title: '答案', key: 'answerMarkdown', ellipsis: { tooltip: true }, width: 180 },
  {
    title: '操作', key: 'actions', width: 80, fixed: 'right',
    render: question => h(NButton, {
      size: 'small', quaternary: true,
      'aria-label': `编辑题目 ${question.id}`,
      onClick: () => editQuestion(question),
    }, { default: () => '编辑' }),
  },
]

function selectCategory(keys: Array<string | number>) {
  const key = keys[0]
  const categoryId = typeof key === 'string' ? directQuestionEntries.value.get(key) : key
  if (categoryId === undefined) return
  if (typeof key === 'number' && parentCategoryIds.value.has(key)) return
  selectedCategoryId.value = categoryId
  search.value = ''
}

function questionRowKey(question: BankQuestion) {
  return question.id
}

async function loadBank() {
  loading.value = true
  error.value = ''
  try {
    bank.value = await readBank()
    selectedCategoryId.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '题库读取失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadBank)
</script>

<template>
  <div class="bank-page">
    <n-alert v-if="error" type="error" title="题库读取失败">
      {{ error }}
      <template #action>
        <n-button size="small" :loading="loading" @click="loadBank">重试</n-button>
      </template>
    </n-alert>

    <n-spin
      class="bank-loading"
      :show="loading"
      content-style="height: 100%; min-height: 0;"
    >
      <div v-if="bank" class="bank-layout">
        <n-card
          size="small"
          title="章节列表"
          class="chapter-card"
          content-class="bank-card-content"
          header-style="flex-shrink: 0; text-align: left;"
        >
          <template #header-extra>
            <n-button
              size="small"
              quaternary
              circle
              style="margin-right: 8px;"
              title="使用 JSON 创建目录"
              aria-label="使用 JSON 创建目录"
              @click="openDirectoryJson"
            >
              <template #icon><n-icon><Code24Regular /></n-icon></template>
            </n-button>
            <n-button
              quaternary
              circle
              size="small"
              title="新建一级分类"
              aria-label="新建一级分类"
              @click="newRootCategory"
            >
              <template #icon><n-icon><Add24Regular /></n-icon></template>
            </n-button>
          </template>
          <n-scrollbar class="chapter-scroll" content-style="padding-right: 16px;">
            <n-tree
              v-model:expanded-keys="expandedKeys"
              :data="categoryTree"
              :render-suffix="renderChapterActions"
              :node-props="() => ({ class: 'chapter-node' })"
              :override-default-node-click-behavior="handleNodeClick"
              :cancelable="false"
              :selected-keys="selectedTreeKeys"
              block-line
              block-node
              ellipsis
              selectable
              @update:selected-keys="selectCategory"
            />
          </n-scrollbar>
        </n-card>

        <n-card
          size="small"
          class="question-card"
          content-class="bank-card-content"
          header-style="flex-shrink: 0;"
        >
          <template #header>
            <n-flex justify="space-between" align="center">
              <n-flex align="center" :size="8" :wrap="false">
                <n-text v-if="selectedCategory" strong>{{ selectedCategory.name }}</n-text>
              </n-flex>
              <n-flex v-if="selectedCategory" class="question-toolbar" align="center" :size="12">
                <n-text depth="3">{{ filteredQuestions.length }} 题</n-text>
                <n-input
                  v-model:value="search"
                  class="question-search"
                  clearable
                  size="small"
                  placeholder="搜索题目"
                />
              </n-flex>
            </n-flex>
          </template>

          <n-flex v-if="selectedCategory" class="batch-toolbar" align="center" :size="8">
            <n-text v-if="selectedCategory" depth="3">已选 {{ checkedQuestionIds.length }} 题</n-text>
            <n-button size="small" type="error" :disabled="!checkedQuestionIds.length" @click="openBatchAction('delete')">
              批量删除
            </n-button>
            <n-button size="small" :disabled="!checkedQuestionIds.length" @click="openBatchAction('move')">
              移动到
            </n-button>
            <n-button size="small" :disabled="!checkedQuestionIds.length" @click="openBatchAction('copy')">
              复制到
            </n-button>
            <n-button v-if="checkedQuestionIds.length" size="small" quaternary @click="checkedQuestionIds = []">
              取消选择
            </n-button>
            <n-button
              type="primary"
              size="small"
              style="margin-left: auto;"
              :loading="openingEntry"
              :disabled="openingEntry"
              @click="openQuestionEntry"
            >
              <template #icon><n-icon><Add24Regular /></n-icon></template>
              题目录入
            </n-button>
          </n-flex>

          <n-data-table
            v-if="selectedCategory"
            :columns="columns"
            :data="filteredQuestions"
            :row-key="questionRowKey"
            :checked-row-keys="checkedQuestionIds"
            size="small"
            striped
            flex-height
            :pagination="false"
            :scroll-x="830"
            @update:checked-row-keys="updateCheckedQuestions"
          />
          <n-empty v-else class="empty-bank" description="请点击左侧末级章节或「本节题目」查看题目" />
        </n-card>
      </div>

      <n-empty
        v-else-if="!loading && !error"
        class="empty-bank"
        description="暂无题库，请先导入或选择题库"
      />
    </n-spin>

    <QuestionEditorDialog
      v-if="editingQuestion"
      :bank-id="editingQuestion.bankId"
      :question="editingQuestion.question"
      @close="editingQuestion = null"
      @saved="applyQuestionChanges"
    />
    <QuestionBatchDialog
      v-if="batchRequest && bank"
      :bank="bank"
      :request="batchRequest"
      @close="batchRequest = null"
      @saved="applyQuestionChanges"
    />

    <n-modal
      v-model:show="showDelete"
      preset="card"
      title="删除章节"
      style="width: min(440px, calc(100vw - 32px));"
      :closable="!deleting"
      :mask-closable="!deleting"
      :close-on-esc="!deleting"
    >
      <n-space vertical :size="16">
        <n-text>确定删除「{{ deleteTarget?.name }}」及其所有子章节和题目吗？这些题目将从整个题库删除，在其他章节中的关联也会移除。此操作无法撤销。</n-text>
        <n-alert v-if="deleteError" type="error">{{ deleteError }}</n-alert>
        <n-flex justify="end">
          <n-button :disabled="deleting" @click="showDelete = false">取消</n-button>
          <n-button type="error" :loading="deleting" @click="removeCategory">确认删除</n-button>
        </n-flex>
      </n-space>
    </n-modal>

    <DirectoryJsonDialog
      v-if="showDirectoryJson && bank"
      :bank="bank"
      @close="showDirectoryJson = false"
      @saved="applyDirectoryChanges"
    />

    <n-modal
      v-model:show="showRename"
      preset="card"
      :title="editorMode === 'create' ? (editingCategoryId === null ? '新建一级分类' : '新建子章节') : '编辑章节名称'"
      style="width: min(440px, calc(100vw - 32px));"
      :closable="!savingName"
      :mask-closable="!savingName"
      :close-on-esc="!savingName"
    >
      <n-space vertical :size="16">
        <n-text v-if="editorMode === 'create' && editingCategoryId !== null" depth="3">添加到：{{ editorParentName }}</n-text>
        <n-input
          v-model:value="categoryName"
          placeholder="请输入章节名称"
          aria-label="章节名称"
          :disabled="savingName"
          @keydown.enter.prevent="saveCategoryName"
        />
        <n-alert v-if="renameError" type="error">{{ renameError }}</n-alert>
        <n-flex justify="end">
          <n-button :disabled="savingName" @click="showRename = false">取消</n-button>
          <n-button type="primary" :loading="savingName" @click="saveCategoryName">保存</n-button>
        </n-flex>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.bank-page {
  display: flex;
  flex-direction: column;
  gap: 12px;

  width: 100%;
  height: calc(100dvh - 112px);
  min-width: 0;
  min-height: 0;

  overflow: hidden;
}

.bank-loading {
  flex: 1;
  min-height: 0;
}

.bank-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;

  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;

  overflow: hidden;
}

.chapter-card,
.question-card {
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 通过 NCard 的 content-class 设置内容布局，不依赖组件内部类名。 */
.bank-page :deep(.bank-card-content) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chapter-scroll {
  flex: 1;
  min-height: 0;
}

.chapter-card {
  text-align: left;
}

.chapter-card :deep(.chapter-actions) {
  display: inline-flex;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 4px;
  margin-left: 8px;
  opacity: 0;
  pointer-events: none;
}

.chapter-card :deep(.chapter-node:hover .chapter-actions),
.chapter-card :deep(.chapter-node:focus-within .chapter-actions) {
  opacity: 1;
  pointer-events: auto;
}

.chapter-card :deep(.n-tree-node-content__suffix) {
  flex-shrink: 0;
  margin-left: auto;
}

@media (hover: none) {
  .chapter-card :deep(.chapter-actions) {
    opacity: 1;
    pointer-events: auto;
  }
}

.question-card :deep(.n-data-table) {
  flex: 1;
  min-height: 0;
}

.question-toolbar {
  max-width: 100%;
}

.batch-toolbar {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.question-search {
  width: 220px;
  max-width: 100%;
}

/* 空状态 */
.empty-bank {
  height: 100%;
  justify-content: center;
}

/* =========================
   移动端
   ========================= */

@media (width < 768px) {
  .bank-page {
    height: calc(100dvh - 96px);
  }

  .bank-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(180px, 32%) minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
