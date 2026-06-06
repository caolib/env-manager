<template>
  <div class="path-var-table" :class="{ 'disabled-var': props.disabled || props.envVar.disabled }">
    <div class="path-var-toolbar">
      <div class="path-var-title">
        <span class="path-var-name" @click="copyName" title="点击复制变量名">
          <template v-for="(part, index) in getHighlightParts(props.envVar.name, props.highlight)"
            :key="`name-${index}`">
            <mark v-if="part.match" class="search-highlight">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
        <a-tag v-if="props.disabled || props.envVar.disabled" color="default">禁用</a-tag>
        <a-tag>{{ editList.length }} 项</a-tag>
      </div>

      <a-space wrap :size="6">
        <a-button size="small" type="primary" @click="savePath" :disabled="!isDirty">保存</a-button>
        <a-button size="small" @click="resetPaths" :disabled="!isDirty">取消</a-button>
        <a-button size="small" @click="checkEditPaths">路径检测</a-button>
        <a-button size="small" @click="showDiff" :disabled="!isDirty">diff</a-button>
        <a-button size="small" @click="addPath">
          <PlusOutlined />
          添加路径
        </a-button>
        <a-button size="small" danger @click="openDeleteConfirm">
          <DeleteOutlined />
          删除变量
        </a-button>
      </a-space>
    </div>

    <a-alert v-if="isDirty" message="有未保存的更改" type="warning" show-icon class="path-var-alert" />

    <a-table :data-source="tableData" :columns="columns" :pagination="false" size="small"
      :row-key="record => record.key" :scroll="{ x: 680, y: 420 }" bordered>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'path'">
          <div class="path-input-highlight-wrap">
            <a-input v-model:value="editList[record.index]" size="small" placeholder="输入路径..."
              @focus="focusedIndex = record.index" @blur="focusedIndex = null" />
            <div v-if="shouldShowPathHighlight(record)" class="path-highlight-overlay">
              <template v-for="(part, index) in getHighlightParts(editList[record.index], props.highlight)"
                :key="`path-${record.index}-${index}`">
                <mark v-if="part.match" class="search-highlight">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-space :size="2">
            <a-button size="small" type="link" @click="openPathItem(record.index)"
              :disabled="!editList[record.index]?.trim()" title="打开目录">
              <FolderOpenOutlined />
            </a-button>
            <a-button size="small" type="link" @click="insertPathAfter(record.index)" title="在下方插入路径">
              <PlusOutlined />
            </a-button>
            <a-button size="small" type="link" danger @click="removePathItem(record.index)" title="删除路径">
              <DeleteOutlined />
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="deleteConfirmOpen" title="删除 Path 变量" ok-text="确认删除" cancel-text="取消"
      :ok-button-props="{ danger: true, disabled: deleteConfirmText !== DELETE_CONFIRM_TEXT }"
      @ok="confirmDeletePathVar" @cancel="cancelDeleteConfirm">
      <p class="delete-confirm-text">
        此操作会删除整个 Path 变量。请输入 <strong>{{ DELETE_CONFIRM_TEXT }}</strong> 确认删除。
      </p>
      <a-input v-model:value="deleteConfirmText" placeholder="delete path" />
    </a-modal>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue';
import { Checkbox, message, Modal } from '../ui';
import { DeleteOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons-vue';
import PathDiffModal from './PathDiffModal.vue';

const props = defineProps({
  envVar: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  highlight: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['delete', 'saveDirect']);

const DELETE_CONFIRM_TEXT = 'delete path';
const editList = ref([]);
const deleteConfirmOpen = ref(false);
const deleteConfirmText = ref('');
const focusedIndex = ref(null);

const pathList = computed(() => {
  const value = props.envVar.value || '';
  return value.split(';').filter(Boolean);
});

const isDirty = computed(() => {
  return editList.value.join(';') !== pathList.value.join(';');
});

const tableData = computed(() => {
  return editList.value.map((path, index) => ({
    key: `path-${index}`,
    index,
    path
  }));
});

const columns = [
  {
    title: '路径',
    key: 'path'
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    align: 'right'
  }
];

function getHighlightParts(value, keyword) {
  const source = String(value || '');
  const search = String(keyword || '');
  if (!search) return [{ text: source, match: false }];

  const sourceLower = source.toLowerCase();
  const keywordLower = search.toLowerCase();
  const parts = [];
  let from = 0;
  let index = sourceLower.indexOf(keywordLower, from);

  while (index !== -1) {
    if (index > from) {
      parts.push({ text: source.slice(from, index), match: false });
    }
    parts.push({ text: source.slice(index, index + search.length), match: true });
    from = index + search.length;
    index = sourceLower.indexOf(keywordLower, from);
  }

  if (from < source.length) {
    parts.push({ text: source.slice(from), match: false });
  }

  return parts;
}

function shouldShowPathHighlight(record) {
  const value = editList.value[record.index] || '';
  return focusedIndex.value !== record.index
    && props.highlight
    && value.toLowerCase().includes(props.highlight.toLowerCase());
}

watch(() => props.envVar.value, () => {
  editList.value = [...pathList.value];
}, { immediate: true });

function copyName() {
  navigator.clipboard.writeText(props.envVar.name).then(() => {
    message.success('已复制变量名到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}

function openDeleteConfirm() {
  deleteConfirmText.value = '';
  deleteConfirmOpen.value = true;
}

function cancelDeleteConfirm() {
  deleteConfirmText.value = '';
}

function confirmDeletePathVar() {
  if (deleteConfirmText.value !== DELETE_CONFIRM_TEXT) return;
  emit('delete', props.envVar);
  deleteConfirmOpen.value = false;
  deleteConfirmText.value = '';
}

function addPath() {
  editList.value.push('');
}

function removePathItem(index) {
  editList.value.splice(index, 1);
}

function insertPathAfter(index) {
  editList.value.splice(index + 1, 0, '');
}

function openPathItem(index) {
  try {
    const value = editList.value[index]?.trim();
    if (!value) return;

    window.services.shellOpenPath(value);
    message.success('已打开');
  } catch (error) {
    message.error(error.message || '打开失败');
  }
}

function resetPaths() {
  editList.value = [...pathList.value];
}

function savePath() {
  const newPaths = editList.value.filter(Boolean);
  const finalValue = newPaths.join(';');
  emit('saveDirect', { ...props.envVar, value: finalValue });
}

function showDiff() {
  const oldPaths = pathList.value;
  const newPaths = editList.value.filter(Boolean);

  Modal.confirm({
    title: '确认保存修改',
    width: '100%',
    wrapClassName: 'full-screen-modal',
    style: { top: 0, paddingBottom: 0, maxWidth: '100%' },
    bodyStyle: { height: 'calc(100vh - 110px)', overflowY: 'auto' },
    content: h(PathDiffModal, { oldPaths, newPaths }),
    okText: '确认保存',
    cancelText: '取消',
    onOk() {
      const finalValue = newPaths.join(';');
      emit('saveDirect', { ...props.envVar, value: finalValue });
    }
  });
}

function removeDuplicateEditPaths() {
  const seen = new Set();
  const unique = [];
  let removedCount = 0;

  for (const item of editList.value) {
    const normalized = item.trim().toLowerCase();
    if (!normalized) {
      unique.push(item);
    } else if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(item.trim());
    } else {
      removedCount++;
    }
  }

  if (removedCount > 0) {
    editList.value = unique;
  }

  return removedCount;
}

function showMissingPathCleanupModal(missingPaths, duplicateRemovedCount) {
  const selectedIndexes = ref(missingPaths.map(item => item.index));

  const MissingPathCleanupContent = defineComponent({
    name: 'MissingPathCleanupContent',
    setup() {
      const allSelected = computed(() => selectedIndexes.value.length === missingPaths.length);
      const indeterminate = computed(() => selectedIndexes.value.length > 0 && selectedIndexes.value.length < missingPaths.length);

      function toggleAll(event) {
        selectedIndexes.value = event.target.checked ? missingPaths.map(item => item.index) : [];
      }

      function toggleOne(index, checked) {
        if (checked) {
          selectedIndexes.value = selectedIndexes.value.includes(index)
            ? selectedIndexes.value
            : [...selectedIndexes.value, index];
        } else {
          selectedIndexes.value = selectedIndexes.value.filter(item => item !== index);
        }
      }

      return () => h('div', {}, [
        h('p', { style: { marginBottom: '8px' } }, `变量名: ${props.envVar.name}`),
        duplicateRemovedCount > 0
          ? h('p', { style: { marginBottom: '8px', color: '#1677ff' } }, `已自动删除重复路径: ${duplicateRemovedCount} 项`)
          : null,
        h('p', { style: { marginBottom: '12px', color: '#ff4d4f', fontWeight: 'bold' } }, `发现不存在路径: ${missingPaths.length} 项`),
        h('div', { style: { marginBottom: '8px' } }, [
          h(Checkbox, {
            checked: allSelected.value,
            indeterminate: indeterminate.value,
            onChange: toggleAll
          }, () => `全选 (${selectedIndexes.value.length}/${missingPaths.length})`)
        ]),
        h('div', { style: { maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--ant-color-border)', borderRadius: '4px', padding: '8px' } },
          missingPaths.map(item =>
            h('div', { style: { marginBottom: '8px' } }, [
              h(Checkbox, {
                checked: selectedIndexes.value.includes(item.index),
                onChange: event => toggleOne(item.index, event.target.checked)
              }, () => h('span', { style: { fontSize: '12px', wordBreak: 'break-all' } }, item.path))
            ])
          )
        )
      ]);
    }
  });

  Modal.confirm({
    title: '路径检测结果',
    width: 720,
    content: h(MissingPathCleanupContent),
    okText: '删除选中项',
    cancelText: '保留',
    onOk() {
      if (selectedIndexes.value.length === 0) {
        message.info('未删除任何路径');
        return;
      }

      const removeIndexes = new Set(selectedIndexes.value);
      editList.value = editList.value.filter((_, index) => !removeIndexes.has(index));
      message.success(`已删除 ${removeIndexes.size} 个不存在的路径`);
    }
  });
}

function checkEditPaths() {
  const duplicateRemovedCount = removeDuplicateEditPaths();
  const missingPaths = [];

  editList.value.forEach((item, index) => {
    if (!window.services?.isPathLike(item)) return;

    const exists = window.services.checkPathExists(item);
    if (!exists) {
      missingPaths.push({
        index,
        path: item
      });
    }
  });

  if (missingPaths.length > 0) {
    showMissingPathCleanupModal(missingPaths, duplicateRemovedCount);
    return;
  }

  if (duplicateRemovedCount > 0) {
    message.success(`检测完成，已删除 ${duplicateRemovedCount} 个重复路径，未发现不存在路径`);
  } else {
    message.success('检测完成，未发现重复或不存在的路径');
  }
}
</script>

<style scoped>
.path-var-table {
  width: 100%;
  border: 1px solid var(--ant-color-border);
  border-radius: 6px;
  padding: 10px;
}

.disabled-var {
  opacity: 0.72;
}

.path-var-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.path-var-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.path-var-name {
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.path-var-alert {
  margin-bottom: 8px;
}

.delete-confirm-text {
  margin-bottom: 8px;
}

.path-input-highlight-wrap {
  position: relative;
}

.path-highlight-overlay {
  position: absolute;
  inset: 1px 28px 1px 8px;
  display: flex;
  align-items: center;
  overflow: hidden;
  color: transparent;
  font-size: 14px;
  line-height: 30px;
  white-space: nowrap;
  pointer-events: none;
}

.path-highlight-overlay :deep(.search-highlight),
.path-var-name :deep(.search-highlight) {
  background-color: yellow !important;
  color: red !important;
  padding: 0;
}

:deep(.ant-table-cell) {
  padding: 6px 8px !important;
}
</style>
