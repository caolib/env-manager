<template>
  <div class="env-manager">
    <!-- 工具栏 -->
    <div class="toolbar">
      <a-space>
        <a-button @click="loadEnvVars" size="small" :loading="loading">
          <ReloadOutlined />
          刷新
        </a-button>
        <a-button @click="checkAllPaths" size="small" :loading="pathChecking">
          路径检测
        </a-button>
        <a-button @click="toggleLayoutMode" size="small"
          :title="settingsStore.layoutMode.value === 'card' ? '切换到表格模式' : '切换到卡片模式'">
          <AppstoreOutlined v-if="settingsStore.layoutMode.value === 'card'" />
          <UnorderedListOutlined v-else />
        </a-button>
        <a-tooltip v-if="!isAdmin" placement="bottom">
          <template #title>
            <div style="max-width: 280px;">
              <div>修改系统环境变量需要管理员权限，请以管理员身份启动utools</div>
            </div>
          </template>
          <a-tag color="warning">
            <WarningOutlined /> 无管理员权限
          </a-tag>
        </a-tooltip>
        <a-tag v-else color="success">
          <CheckOutlined />
          管理员
        </a-tag>
      </a-space>
    </div>

    <!-- 环境变量列表 -->
    <div class="content">
      <a-collapse v-model:activeKey="activeKeys" :bordered="false">
        <!-- 系统环境变量 -->
        <a-collapse-panel key="system">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <WindowsOutlined />
                系统环境变量
                <a-tag>{{ systemVars.length }}</a-tag>
              </span>
              <a-tooltip v-if="!isAdmin" title="需要管理员权限才能添加系统环境变量">
                <a-button size="small" type="primary" :disabled="true">
                  <PlusOutlined />
                  添加
                </a-button>
              </a-tooltip>
              <a-button v-else size="small" type="primary" @click.stop="showAddSystemDialog">
                <PlusOutlined />
                添加
              </a-button>
            </div>
          </template>

          <!-- 卡片模式 -->
          <div v-if="settingsStore.layoutMode.value === 'card'" class="vars-container">
            <EnvVarCard v-for="row in filteredSystemVars" :key="row.name" :env-var="row" :highlight="searchKeyword"
              :disabled="row.disabled" :is-readonly="!isAdmin"
              :sensitive-fields-enabled="settingsStore.sensitiveFieldsEnabled.value"
              :sensitive-keywords="settingsStore.sensitiveKeywords.value" @edit="(row) => editVar(row, 'system')"
              @delete="(row) => deleteVar(row, 'system')" />
          </div>

          <!-- 表格模式 -->
          <div v-else class="table-container">
            <a-table :dataSource="filteredSystemVars" :columns="tableColumns" :pagination="false" size="small"
              :rowKey="(record) => record.name" :scroll="{ x: 'max-content' }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span v-html="renderHighlight(record.name)" class="clickable" @click="copyText(record.name)"
                    title="点击复制"></span>
                  <a-tag v-if="record.disabled" color="default" style="margin-left: 8px;">禁用</a-tag>
                </template>
                <template v-else-if="column.key === 'value'">
                  <span v-html="renderHighlight(renderValue(record))" class="clickable" @click="copyText(record.value)"
                    title="点击复制"></span>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-space :size="4">
                    <a-button v-if="isValidPath(record.value)" size="small" type="link" @click="openPath(record.value)"
                      title="打开文件/文件夹">
                      <FolderOpenOutlined />
                    </a-button>
                    <a-button v-if="isValidURL(record.value)" size="small" type="link" @click="openURL(record.value)"
                      title="在浏览器中打开">
                      <LinkOutlined />
                    </a-button>
                    <a-button size="small" type="link" @click="copyText(`${record.name}=${record.value}`)"
                      title="复制 KEY=VALUE">
                      <CopyOutlined />
                    </a-button>
                    <a-tooltip v-if="!isAdmin" title="需要管理员权限">
                      <a-button size="small" type="link" :disabled="true">
                        <EditOutlined />
                      </a-button>
                    </a-tooltip>
                    <a-button v-else size="small" type="link" @click="editVar(record, 'system')">
                      <EditOutlined />
                    </a-button>
                    <a-popconfirm v-if="isAdmin" title="确定要删除该变量吗？" ok-text="确定" cancel-text="取消"
                      @confirm="deleteVar(record, 'system')">
                      <a-button size="small" type="link" danger>
                        <DeleteOutlined />
                      </a-button>
                    </a-popconfirm>
                    <a-tooltip v-else title="需要管理员权限">
                      <a-button size="small" type="link" danger :disabled="true">
                        <DeleteOutlined />
                      </a-button>
                    </a-tooltip>
                  </a-space>
                </template>
              </template>
            </a-table>
          </div>
        </a-collapse-panel>

        <!-- 用户环境变量 -->
        <a-collapse-panel key="user">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <UserOutlined />
                用户环境变量
                <a-tag>{{ userVars.length }}</a-tag>
              </span>
              <a-button size="small" type="primary" @click.stop="showAddUserDialog">
                <PlusOutlined />
                添加
              </a-button>
            </div>
          </template>

          <!-- 卡片模式 -->
          <div v-if="settingsStore.layoutMode.value === 'card'" class="vars-container">
            <EnvVarCard v-for="row in filteredUserVars" :key="row.name" :env-var="row" :highlight="searchKeyword"
              :disabled="row.disabled" :sensitive-fields-enabled="settingsStore.sensitiveFieldsEnabled.value"
              :sensitive-keywords="settingsStore.sensitiveKeywords.value" @edit="(row) => editVar(row, 'user')"
              @delete="(row) => deleteVar(row, 'user')" />
          </div>

          <!-- 表格模式 -->
          <div v-else class="table-container">
            <a-table :dataSource="filteredUserVars" :columns="tableColumns" :pagination="false" size="small"
              :rowKey="(record) => record.name" :scroll="{ x: 'max-content' }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span v-html="renderHighlight(record.name)" class="clickable" @click="copyText(record.name)"
                    title="点击复制"></span>
                  <a-tag v-if="record.disabled" color="default" style="margin-left: 8px;">禁用</a-tag>
                </template>
                <template v-else-if="column.key === 'value'">
                  <span v-html="renderHighlight(renderValue(record))" class="clickable" @click="copyText(record.value)"
                    title="点击复制"></span>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-space :size="4">
                    <a-button v-if="isValidPath(record.value)" size="small" type="link" @click="openPath(record.value)"
                      title="打开文件/文件夹">
                      <FolderOpenOutlined />
                    </a-button>
                    <a-button v-if="isValidURL(record.value)" size="small" type="link" @click="openURL(record.value)"
                      title="在浏览器中打开">
                      <LinkOutlined />
                    </a-button>
                    <a-button size="small" type="link" @click="copyText(`${record.name}=${record.value}`)"
                      title="复制 KEY=VALUE">
                      <CopyOutlined />
                    </a-button>
                    <a-button size="small" type="link" @click="editVar(record, 'user')">
                      <EditOutlined />
                    </a-button>
                    <a-popconfirm title="确定要删除该变量吗？" ok-text="确定" cancel-text="取消" @confirm="deleteVar(record, 'user')">
                      <a-button size="small" type="link" danger>
                        <DeleteOutlined />
                      </a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>

    <!-- 添加/编辑对话框 -->
    <a-modal v-model:open="showDialog" :title="editMode ? '编辑环境变量' : '添加环境变量'" @ok="handleSubmit" @cancel="cancelEdit"
      :confirmLoading="submitting" width="700px">
      <a-form :model="formData" layout="horizontal" :label-col="{ style: { width: 'auto' } }">
        <!-- 启用/禁用开关 -->
        <a-form-item :label-col="{ span: 0 }" :wrapper-col="{ span: 24 }">
          <div
            style="display: flex; align-items: center; gap: 12px; padding: 8px; background-color: var(--ant-color-fill-quaternary); border-radius: 4px;">
            <a-switch v-model:checked="formEnabled" checked-children="启用" un-checked-children="禁用" />
            <a-tooltip placement="right">
              <template #title>
                <div v-if="formEnabled" style="max-width: 280px;">
                  禁用后变量将不生效，但会保存在插件中，可随时重新启用。
                </div>
              </template>
              <QuestionCircleOutlined style="color: var(--ant-color-text-tertiary); cursor: help;" />
            </a-tooltip>
          </div>
        </a-form-item>

        <a-form-item label="变量名" required>
          <a-input v-model:value="formData.name" placeholder="输入变量名" />
        </a-form-item>

        <a-form-item label="变量值" required>
          <a-textarea v-model:value="formData.value" placeholder="输入变量值" :auto-size="{ minRows: 1, maxRows: 8 }" />
        </a-form-item>

        <!-- KV 格式快捷输入 -->
        <a-form-item label="键值对">
          <a-input v-model:value="kvInput" placeholder="输入K=V快速填充上面的变量" @input="parseKVInput" />
        </a-form-item>

        <!-- 普通变量：备用值管理（Path 变量不显示） -->
        <a-form-item v-if="showAlternativesSection" label="备用值">
          <div style="display:flex; gap: 8px; align-items: flex-start; margin-bottom: 8px;">
            <a-textarea v-model:value="altValueInput" placeholder="输入一个备用值" :auto-size="{ minRows: 1, maxRows: 4 }"
              style="flex: 1;" />
            <a-input v-model:value="altNoteInput" placeholder="备注（选填）" style="width: 160px;" />
            <a-button type="primary" @click="addAlternative" :disabled="!canAddAlternative">添加</a-button>
          </div>

          <div v-if="shouldShowAlternativesList"
            style="border: 1px solid var(--ant-color-border); border-radius: 6px; padding: 8px;">
            <div v-for="(item, idx) in displayAlternatives" :key="idx"
              style="display:flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--ant-color-split);"
              :style="idx === displayAlternatives.length - 1 ? { borderBottom: 'none' } : {}">
              <div style="flex: 1; min-width: 0; display: flex; gap: 8px; align-items: center;">
                <div style="word-break: break-all; font-size: 12px; flex: 1;">
                  {{ item.value }}
                </div>
                <!-- 编辑状态：显示输入框 -->
                <a-input v-if="editingNoteIndex === idx" v-model:value="editingNoteValue" size="small"
                  placeholder="输入备注（回车保存，ESC取消）" @keydown="handleNoteKeydown($event, idx)" @blur="saveNoteEdit(idx)"
                  :autofocus="true" style="width: 150px; height: 24px; font-size: 12px;" />
                <!-- 非编辑状态：显示备注标签或添加按钮 -->
                <template v-else>
                  <a-tag v-if="item.note" :closable="true" @close.prevent="updateAlternativeNote(idx, '')"
                    @click="editAlternativeNote(idx, item.note)"
                    style="cursor: pointer; margin: 0; height: 24px; line-height: 22px;">
                    {{ item.note }}
                  </a-tag>
                  <a-button v-else size="small" @click="editAlternativeNote(idx, '')"
                    style="height: 24px; padding: 0 8px;">
                    添加备注
                  </a-button>
                </template>
              </div>
              <a-space :size="4">
                <!-- 当前使用中的值显示标签，非当前值显示切换按钮 -->
                <a-tag v-if="item.isCurrentValue" color="success"
                  style="margin: 0; height: 24px; line-height: 22px;">使用中</a-tag>
                <a-button v-else size="small" @click="applyAlternative(item.value)"
                  style="height: 24px; padding: 0 8px;">切换</a-button>
                <a-popconfirm title="删除该备用值？" ok-text="删除" cancel-text="取消" @confirm="removeAlternative(idx)">
                  <a-button size="small" danger style="height: 24px; padding: 0 8px;" title="删除">
                    <DeleteOutlined />
                  </a-button>
                </a-popconfirm>
              </a-space>
            </div>
          </div>
        </a-form-item>

        <a-alert v-if="formData.scope === 'system'" message="修改系统环境变量需要管理员权限" type="warning" show-icon />
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined,
  ReloadOutlined,
  WindowsOutlined,
  UserOutlined,
  WarningOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  CopyOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  LinkOutlined
} from '@ant-design/icons-vue';
import EnvVarCard from './EnvVarCard.vue';
import { useSettingsStore } from '../stores/settings';
import { getData, setData } from '../utils/store';

const props = defineProps({
  enterAction: {
    type: Object,
    default: () => ({})
  }
});

const settingsStore = useSettingsStore();

// 普通变量：备用值（按 scope + name 存储到 dbStorage）
const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1';
const alternativesState = ref(loadAlternatives());

// 禁用变量存储
const DISABLED_VARS_KEY = 'env-manager-disabled-vars-v1';
const disabledVarsState = ref(loadDisabledVars());

function loadAlternatives() {
  const saved = getData(ALT_VALUES_KEY, null);
  if (saved && typeof saved === 'object') {
    return {
      system: saved.system && typeof saved.system === 'object' ? saved.system : {},
      user: saved.user && typeof saved.user === 'object' ? saved.user : {}
    };
  }
  return { system: {}, user: {} };
}

function persistAlternatives() {
  const serializableValue = JSON.parse(JSON.stringify(alternativesState.value));
  setData(ALT_VALUES_KEY, serializableValue);
}

function normalizeScope(scope) {
  return scope === 'system' ? 'system' : 'user';
}

function getAlternatives(scope, name) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return [];
  const list = alternativesState.value?.[s]?.[key];
  return Array.isArray(list) ? list : [];
}

function setAlternatives(scope, name, list) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return;
  if (!alternativesState.value[s]) alternativesState.value[s] = {};
  alternativesState.value[s][key] = list;
  persistAlternatives();
}

function removeAlternatives(scope, name) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return;
  if (alternativesState.value?.[s] && alternativesState.value[s][key]) {
    delete alternativesState.value[s][key];
    persistAlternatives();
  }
}

// 禁用变量管理函数
function loadDisabledVars() {
  const saved = getData(DISABLED_VARS_KEY, null);
  if (saved && typeof saved === 'object') {
    return {
      system: saved.system && typeof saved.system === 'object' ? saved.system : {},
      user: saved.user && typeof saved.user === 'object' ? saved.user : {}
    };
  }
  return { system: {}, user: {} };
}

function persistDisabledVars() {
  const serializableValue = JSON.parse(JSON.stringify(disabledVarsState.value));
  setData(DISABLED_VARS_KEY, serializableValue);
}

function getDisabledVar(scope, name) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return null;
  return disabledVarsState.value?.[s]?.[key] || null;
}

function setDisabledVar(scope, name, value) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return;
  if (!disabledVarsState.value[s]) disabledVarsState.value[s] = {};
  disabledVarsState.value[s][key] = { value, disabledAt: Date.now() };
  persistDisabledVars();
}

function removeDisabledVar(scope, name) {
  const s = normalizeScope(scope);
  const key = (name || '').trim();
  if (!key) return;
  if (disabledVarsState.value?.[s] && disabledVarsState.value[s][key]) {
    delete disabledVarsState.value[s][key];
    persistDisabledVars();
  }
}

function isVarDisabled(scope, name) {
  return getDisabledVar(scope, name) !== null;
}


function moveAlternatives(scope, fromName, toName) {
  const s = normalizeScope(scope);
  const fromKey = (fromName || '').trim();
  const toKey = (toName || '').trim();
  if (!fromKey || !toKey || fromKey === toKey) return;
  const fromList = getAlternatives(s, fromKey);
  if (!fromList.length) return;

  const existing = getAlternatives(s, toKey);
  const merged = mergeAlternatives(existing, fromList);
  setAlternatives(s, toKey, merged);
  removeAlternatives(s, fromKey);
}

function mergeAlternatives(baseList, incomingList) {
  const result = [];
  const seen = new Set();
  const pushItem = (it) => {
    const value = (it?.value ?? '').toString();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    result.push({ value, note: (it?.note ?? '').toString() });
  };
  [...incomingList, ...baseList].forEach(pushItem);
  return result;
}

function ensureAlternativeExists(scope, name, value, note = '') {
  const varName = (name || '').trim();
  const v = (value ?? '').toString();
  if (!varName || !v) return;
  if (isPathVarValue(v)) return;

  const existing = getAlternatives(scope, varName);
  const has = existing.some(it => (it?.value ?? '').toString() === v);
  if (has) return;

  setAlternatives(scope, varName, [{ value: v, note: (note ?? '').toString() }, ...existing]);
}

// 状态
const systemVars = ref([]);
const userVars = ref([]);
const searchKeyword = ref('');
const loading = ref(false);
const submitting = ref(false);
const isAdmin = ref(false);
const activeKeys = ref(['user']); // 默认只展开用户环境变量
const pathChecking = ref(false);

// 对话框相关
const showDialog = ref(false);
const editMode = ref(false);
const originalVarName = ref('');
const kvInput = ref('');
const formData = ref({
  name: '',
  value: '',
  scope: 'user',
  disabled: false
});

// 启用状态计算属性（开关打开=启用，开关关闭=禁用）
const formEnabled = computed({
  get: () => !formData.value.disabled,
  set: (val) => { formData.value.disabled = !val; }
});

// 备用值 UI 状态
const altValueInput = ref('');
const altNoteInput = ref('');
const editingNoteIndex = ref(-1);
const editingNoteValue = ref('');

// 判断是否为 path 变量（分号分隔的多路径）
function isPathVarValue(value) {
  const v = (value ?? '').toString().trim();
  if (!v) return false;
  return v.includes(';') && v.split(';').filter(Boolean).length > 1;
}

const showAlternativesSection = computed(() => {
  // 仅对普通变量显示；Path 变量不显示
  // 普通变量始终显示输入区域
  if (!formData.value.name?.trim() || isPathVarValue(formData.value.value)) {
    return false;
  }
  return true;
});

const shouldShowAlternativesList = computed(() => {
  if (!formData.value.name?.trim()) return false;
  const alternatives = getAlternatives(formData.value.scope, formData.value.name);
  const currentValue = (formData.value.value ?? '').toString();

  // 如果没有备用值，不显示列表
  if (alternatives.length === 0) return false;

  // 如果只有一个备用值且等于当前值，不显示列表
  if (alternatives.length === 1 && alternatives[0].value === currentValue) {
    return false;
  }

  // 其他情况显示列表
  return true;
});

const currentAlternatives = computed(() => {
  if (!formData.value.name?.trim()) return [];
  return getAlternatives(formData.value.scope, formData.value.name);
});

// 显示的备用值列表，标记当前使用中的值
const displayAlternatives = computed(() => {
  const alternatives = currentAlternatives.value;
  const currentValue = (formData.value.value ?? '').toString();

  return alternatives.map(item => ({
    ...item,
    isCurrentValue: item.value === currentValue
  }));
});

const canAddAlternative = computed(() => {
  return !!formData.value.name?.trim() && !!altValueInput.value.trim() && !isPathVarValue(formData.value.value);
});

function addAlternative() {
  const name = formData.value.name?.trim();
  if (!name) return;
  if (isPathVarValue(formData.value.value)) return;

  const value = altValueInput.value.trim();
  const note = altNoteInput.value.trim();
  if (!value) return;

  const existing = getAlternatives(formData.value.scope, name);
  const withoutSame = existing.filter(it => (it?.value ?? '').toString() !== value);
  const next = [{ value, note }, ...withoutSame];
  setAlternatives(formData.value.scope, name, next);
  altValueInput.value = '';
  altNoteInput.value = '';
  message.success('已添加备用值');
}

function removeAlternative(index) {
  const name = formData.value.name?.trim();
  if (!name) return;
  const existing = getAlternatives(formData.value.scope, name);
  const next = existing.filter((_, i) => i !== index);
  setAlternatives(formData.value.scope, name, next);
  message.success('已删除备用值');
}

function applyAlternative(value) {
  // 切换前，先把当前值自动保存为一个备用值，避免"切换后原值丢失"
  const currentValue = (formData.value.value ?? '').toString();
  if (currentValue && currentValue !== value) {
    ensureAlternativeExists(formData.value.scope, formData.value.name, currentValue);
  }
  formData.value.value = value;
}

// 编辑备用值备注 - 原地编辑
function editAlternativeNote(index, currentNote) {
  editingNoteIndex.value = index;
  editingNoteValue.value = currentNote;
}

// 保存备注编辑
function saveNoteEdit(index) {
  // 如果已经退出编辑状态，直接返回，避免重复保存
  if (editingNoteIndex.value === -1) return;

  const newNote = editingNoteValue.value.trim();
  updateAlternativeNote(index, newNote);
  editingNoteIndex.value = -1;
  editingNoteValue.value = '';
}

// 取消备注编辑
function cancelNoteEdit() {
  editingNoteIndex.value = -1;
  editingNoteValue.value = '';
}

// 处理备注输入框按键
function handleNoteKeydown(event, index) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveNoteEdit(index);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelNoteEdit();
  }
}

// 更新备用值备注
function updateAlternativeNote(index, newNote) {
  const name = formData.value.name?.trim();
  if (!name) return;
  const existing = getAlternatives(formData.value.scope, name);
  if (index < 0 || index >= existing.length) return;

  const updated = existing.map((item, i) => {
    if (i === index) {
      return { ...item, note: newNote };
    }
    return item;
  });

  setAlternatives(formData.value.scope, name, updated);
  message.success(newNote ? '备注已更新' : '备注已删除');
}


// 计算属性：过滤后的变量
const filteredSystemVars = computed(() => {
  return mergeAndFilterVars(systemVars.value, 'system');
});

const filteredUserVars = computed(() => {
  return mergeAndFilterVars(userVars.value, 'user');
});

// 表格列定义
const tableColumns = [
  {
    title: '变量名',
    key: 'name',
    dataIndex: 'name',
    width: 200,
    ellipsis: true,
    sorter: (a, b) => a.name.localeCompare(b.name),
    defaultSortOrder: 'ascend'
  },
  {
    title: '值',
    key: 'value',
    dataIndex: 'value',
    ellipsis: true,
    width: '50vw'
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    align: 'right',
    fixed: 'right'
  }
];

// HTML 转义函数
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 高亮关键词函数
function renderHighlight(text) {
  if (!text) return '';
  if (!searchKeyword.value) return escapeHtml(text);
  const src = String(text);
  const k = String(searchKeyword.value);
  const srcLower = src.toLowerCase();
  const kLower = k.toLowerCase();
  let i = 0;
  let from = 0;
  let out = '';
  while ((i = srcLower.indexOf(kLower, from)) !== -1) {
    out += escapeHtml(src.slice(from, i));
    const match = src.slice(i, i + k.length);
    out += `<mark style="background-color: yellow; color: red; padding: 0;">${escapeHtml(match)}</mark>`;
    from = i + k.length;
  }
  out += escapeHtml(src.slice(from));
  return out;
}

// 渲染值（处理敏感信息）
function renderValue(record) {
  if (!record || !record.value) return '';
  const value = record.value;

  // 检查是否是敏感字段
  if (settingsStore.sensitiveFieldsEnabled.value) {
    const varNameLower = record.name.toLowerCase();
    const keywords = settingsStore.sensitiveKeywords.value || [];
    const isSensitive = keywords.some(keyword => varNameLower.includes(keyword.toLowerCase()));

    if (isSensitive && value.length > 10) {
      const visibleLength = Math.ceil(value.length / 2);
      return value.substring(0, visibleLength) + '...';
    }
  }

  return value;
}

// 复制文本到剪贴板
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板');
  }).catch(() => {
    message.error('复制失败');
  });
}

// 判断值是否为有效路径
function isValidPath(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();

  // 排除分号分隔的值（PATH变量）
  if (trimmed.includes(';') && trimmed.split(';').filter(Boolean).length > 1) {
    return false;
  }

  // 检查是否为路径格式
  if (!window.services?.isPathLike(trimmed)) return false;

  // 检查路径是否存在
  return window.services.checkPathExists(trimmed);
}

// 判断值是否为有效URL
function isValidURL(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();

  // 排除分号分隔的值
  if (trimmed.includes(';') && trimmed.split(';').filter(Boolean).length > 1) {
    return false;
  }

  // 检查是否为有效URL
  return window.services?.isURL(trimmed);
}

// 打开文件或文件夹
function openPath(value) {
  try {
    if (!value) return;
    window.services.shellOpenPath(value.trim());
    message.success('已打开');
  } catch (error) {
    message.error(error.message || '打开失败');
  }
}

// 打开URL
function openURL(value) {
  try {
    if (!value) return;
    window.services.openURL(value.trim());
    message.success('已在浏览器中打开');
  } catch (error) {
    message.error(error.message || '打开链接失败');
  }
}

// 合并并过滤变量（激活的 + 禁用的）
function mergeAndFilterVars(activeVars, scope) {
  // 1. 从注册表获取的激活变量
  const active = activeVars.map(v => ({ ...v, disabled: false }));

  // 2. 从 dbStorage 获取禁用的变量
  const disabledVarsObj = disabledVarsState.value[scope] || {};
  const disabled = Object.keys(disabledVarsObj).map(name => ({
    name,
    value: disabledVarsObj[name].value,
    disabled: true,
    disabledAt: disabledVarsObj[name].disabledAt
  }));

  // 3. 合并（确保禁用变量不会与激活变量重复）
  const disabledNames = new Set(disabled.map(v => v.name));
  const activeFiltered = active.filter(v => !disabledNames.has(v.name));
  const merged = [...activeFiltered, ...disabled];

  // 4. 应用搜索过滤
  let filtered = merged;
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    filtered = merged.filter(v => {
      return v.name.toLowerCase().includes(keyword) || v.value.toLowerCase().includes(keyword);
    });
  }

  // 5. 排序：启用的 Path 变量 -> 启用的普通变量 -> 禁用的 Path 变量 -> 禁用的普通变量
  return filtered.sort((a, b) => {
    // 首先按禁用状态排序（启用在前）
    if (a.disabled !== b.disabled) {
      return a.disabled ? 1 : -1;
    }

    // 同状态下，path 变量在后
    const aIsPath = isPathVar(a);
    const bIsPath = isPathVar(b);
    if (aIsPath !== bIsPath) {
      return aIsPath ? 1 : -1;
    }

    // 禁用变量按禁用时间排序（越晚禁用的越靠后）
    if (a.disabled && b.disabled) {
      return (a.disabledAt || 0) - (b.disabledAt || 0);
    }

    // 其他情况按名称排序
    return a.name.localeCompare(b.name);
  });
}

// 过滤函数（已废弃，由 mergeAndFilterVars 替代）
function filterVars(vars) {
  let filtered = vars;
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    filtered = vars.filter(v => {
      return v.name.toLowerCase().includes(keyword) || v.value.toLowerCase().includes(keyword);
    });
  }

  // 将 path 变量排在最后
  return filtered.sort((a, b) => {
    const aIsPath = isPathVar(a);
    const bIsPath = isPathVar(b);
    if (aIsPath === bIsPath) return 0;
    return aIsPath ? 1 : -1;
  });
}

// 判断是否为 path 变量（分号分隔的多路径）
function isPathVar(envVar) {
  const value = envVar.value?.trim();
  if (!value) return false;
  return value.includes(';') && value.split(';').filter(Boolean).length > 1;
}



// 切换布局模式
function toggleLayoutMode() {
  const currentMode = settingsStore.layoutMode.value;
  const newMode = currentMode === 'card' ? 'table' : 'card';
  settingsStore.setLayoutMode(newMode);
  message.success(`已切换到${newMode === 'card' ? '卡片' : '表格'}模式`);
}

// 加载环境变量
async function loadEnvVars() {
  loading.value = true;
  try {
    const result = window.services.getEnvVars();
    systemVars.value = result.systemVars || [];
    userVars.value = result.userVars || [];
  } catch (error) {
    message.error(`获取环境变量失败: ${error.message}`);
    console.error('Error loading env vars:', error);
  } finally {
    loading.value = false;
  }
}

// 检查是否首次使用并显示风险提示
function checkFirstTimeUse() {
  const FIRST_TIME_KEY = 'env-manager-first-time-use';
  const isFirstTime = getData(FIRST_TIME_KEY, true);

  if (isFirstTime) {
    showFirstTimeWarning();
    setData(FIRST_TIME_KEY, false);
  }
}

// 显示首次使用警告对话框
function showFirstTimeWarning() {
  Modal.warning({
    title: '重要提示',
    width: 500,
    content: '修改环境变量存在风险！建议在进行任何修改之前，请先导出当前配置作为备份。',
    okText: '我已知晓',
    onOk: () => {
      // 提示用户导出备份
      Modal.confirm({
        title: '是否现在导出备份？',
        content: '强烈建议您先导出当前的环境变量配置作为备份。',
        okText: '立即导出',
        cancelText: '稍后再说',
        onOk: () => {
          exportCurrentConfig();
        }
      });
    }
  });
}

// 导出当前配置
function exportCurrentConfig() {
  try {
    // 使用东八区时间
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const timestamp = beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `env-manager-初始备份-${timestamp}.json`;

    const configData = {
      version: '1.2.0',
      exportTime: beijingTime.toISOString(),
      settings: {
        theme: settingsStore.theme.value,
        sensitiveFieldsEnabled: settingsStore.sensitiveFieldsEnabled.value,
        sensitiveKeywords: settingsStore.sensitiveKeywords.value
      },
      var_alternatives: alternativesState.value,
      disabled_vars: disabledVarsState.value,
      env_vars: {
        system_vars: systemVars.value,
        user_vars: userVars.value
      }
    };

    const result = window.services.exportConfig(configData, fileName);
    if (result.success) {
      message.success(`备份已导出到: ${result.path}`);
      // 自动打开文件所在位置
      window.services.revealInExplorer(result.path);
    } else {
      if (result.message !== '用户取消保存') {
        message.error(`导出失败: ${result.message}`);
      }
    }
  } catch (error) {
    message.error(`导出配置失败: ${error.message}`);
    console.error('Export error:', error);
  }
}

// 检查管理员权限
function checkAdminPrivileges() {
  try {
    isAdmin.value = window.services.checkAdminPrivileges();
    // 根据管理员权限设置默认展开的面板
    if (isAdmin.value) {
      activeKeys.value = ['system', 'user']; // 有管理员权限时展开所有
    } else {
      activeKeys.value = ['user']; // 无管理员权限时只展开用户变量
    }
  } catch (error) {
    console.error('检查管理员权限失败:', error);
    isAdmin.value = false;
    activeKeys.value = ['user'];
  }
}

// 以管理员身份重启
function restartAsAdmin() {
  Modal.confirm({
    title: '以管理员身份重启',
    content: 'uTools 将重新启动,当前会话将关闭。是否继续?',
    okText: '确定',
    cancelText: '取消',
    onOk() {
      try {
        window.services.restartAsAdmin();
        message.success('正在重启...');
      } catch (error) {
        console.error('重启失败:', error);
        message.error('重启失败: ' + error.message);
      }
    }
  });
}

// 显示添加对话框
function showAddSystemDialog() {
  formData.value = { name: '', value: '', scope: 'system', disabled: false };
  editMode.value = false;
  showDialog.value = true;
}

function showAddUserDialog() {
  formData.value = { name: '', value: '', scope: 'user', disabled: false };
  editMode.value = false;
  showDialog.value = true;
}

// 编辑变量
function editVar(row, scope) {
  // 如果是 PATH 变量（分号分隔的值）且当前在表格模式，切换到卡片模式
  if (settingsStore.layoutMode.value === 'table' && isPathVarValue(row.value)) {
    settingsStore.setLayoutMode('card');
    message.info('PATH 变量已切换到卡片模式进行编辑');
    // 等待下一帧，确保卡片已渲染
    setTimeout(() => {
      // 这里不需要额外操作，因为 EnvVarCard 会自动处理编辑
    }, 100);
    return;
  }

  // 检查变量是否禁用
  const disabledInfo = getDisabledVar(scope, row.name);

  formData.value = {
    name: row.name,
    value: row.value,
    scope: scope,
    disabled: !!disabledInfo  // 设置禁用状态
  };
  originalVarName.value = row.name;
  editMode.value = true;
  showDialog.value = true;

  // 进入编辑弹窗时，把当前值自动纳入备用值（仅普通变量）
  ensureAlternativeExists(scope, row.name, row.value);

  // 清理备用值输入
  altValueInput.value = '';
  altNoteInput.value = '';
}

// 取消编辑
function cancelEdit() {
  showDialog.value = false;
  formData.value = { name: '', value: '', scope: 'user', disabled: false };
  kvInput.value = '';
  editMode.value = false;
  originalVarName.value = '';

  altValueInput.value = '';
  altNoteInput.value = '';
}

// 解析 KV 格式输入
function parseKVInput() {
  const input = kvInput.value.trim();
  if (!input) return;

  const match = input.match(/^([^=]+)=(.*)$/);
  if (match) {
    formData.value.name = match[1].trim();
    formData.value.value = match[2].trim();
  }
}

// 提交表单
async function handleSubmit() {
  if (!formData.value.name || !formData.value.value) {
    message.warning('请填写完整的变量信息');
    return;
  }

  // 检查是否已存在（只检查激活的变量）
  const targetVars = formData.value.scope === 'system' ? systemVars.value : userVars.value;
  const existingVar = targetVars.find(v => v.name === formData.value.name);

  if (existingVar && !editMode.value) {
    const confirmed = await new Promise(resolve => {
      Modal.confirm({
        title: '变量已存在',
        content: `变量 "${formData.value.name}" 已存在，是否覆盖？`,
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    if (!confirmed) return;
  }

  submitting.value = true;
  try {
    // 如果是编辑模式且变量名发生了变化，迁移备用值
    if (editMode.value && originalVarName.value && originalVarName.value !== formData.value.name) {
      moveAlternatives(formData.value.scope, originalVarName.value, formData.value.name);
    }

    // 如果是编辑模式且变量名发生了变化，先删除旧的（注册表和禁用存储）
    if (editMode.value && originalVarName.value !== formData.value.name) {
      // 删除注册表中的旧变量（可能不存在，忽略错误）
      try {
        await window.services.deleteEnvVar(
          originalVarName.value,
          formData.value.scope === 'system'
        );
      } catch (err) {
        // 忽略删除失败（可能原本就是禁用状态）
      }
      // 删除禁用存储中的旧变量
      removeDisabledVar(formData.value.scope, originalVarName.value);
    }

    // 根据启用/禁用状态处理
    if (formData.value.disabled) {
      // 禁用：从注册表删除，保存到 dbStorage
      try {
        await window.services.deleteEnvVar(
          formData.value.name,
          formData.value.scope === 'system'
        );
      } catch (err) {
        // 忽略删除失败（可能原本就不存在）
      }
      setDisabledVar(formData.value.scope, formData.value.name, formData.value.value);
    } else {
      // 启用：写入注册表，从 dbStorage 删除
      await window.services.setEnvVar(
        formData.value.name,
        formData.value.value,
        formData.value.scope === 'system'
      );
      removeDisabledVar(formData.value.scope, formData.value.name);
    }

    const action = editMode.value ? '更新' : '添加';
    const status = formData.value.disabled ? '（已禁用）' : '';
    message.success(`变量 "${formData.value.name}" ${action}成功${status}`);

    showDialog.value = false;
    cancelEdit();
    await loadEnvVars();
  } catch (error) {
    const action = editMode.value ? '更新' : '添加';
    message.error(`${action}失败: ${error.message}`);
    console.error('Error saving env var:', error);
  } finally {
    submitting.value = false;
  }
}

// 删除变量
async function deleteVar(row, scope) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除变量 "${row.name}" 吗？此操作将从注册表和插件存储中永久删除该变量。`,
    onOk: async () => {
      try {
        // 删除注册表中的变量
        try {
          await window.services.deleteEnvVar(row.name, scope === 'system');
        } catch (err) {
          // 忽略删除失败（可能是禁用状态）
        }
        // 删除禁用存储
        removeDisabledVar(scope, row.name);
        // 同步清理备用值
        removeAlternatives(scope, row.name);
        message.success(`变量 "${row.name}" 删除成功`);
        await loadEnvVars();
      } catch (error) {
        message.error(`删除失败: ${error.message}`);
        console.error('Error deleting env var:', error);
      }
    }
  });
}



// 全局路径检测
async function checkAllPaths() {
  pathChecking.value = true;

  try {
    const allVars = [...systemVars.value, ...userVars.value];
    let totalPaths = 0;
    let existCount = 0;
    let notExistCount = 0;
    const notExistDetails = [];

    for (const envVar of allVars) {
      const value = envVar.value?.trim();
      if (!value) continue;

      // 检查是否为分号分隔的路径列表
      if (value.includes(';') && value.split(';').filter(Boolean).length > 1) {
        const paths = value.split(';').filter(Boolean);
        for (const path of paths) {
          if (window.services?.isPathLike(path)) {
            // 检查是否为目录(不是文件)
            const dirStatus = window.services?.isDirectory ? window.services.isDirectory(path) : null;
            if (dirStatus === false) continue; // 跳过文件

            totalPaths++;
            const exists = window.services.checkPathExists(path);
            // 清理 file: 前缀用于显示
            const cleanPath = path.replace(/^file:/, '');
            if (exists) {
              existCount++;
            } else {
              notExistCount++;
              notExistDetails.push({
                varName: envVar.name,
                path: cleanPath
              });
            }
          }
        }
      } else if (window.services?.isPathLike(value)) {
        // 检查是否为目录(不是文件)
        const dirStatus = window.services?.isDirectory ? window.services.isDirectory(value) : null;
        if (dirStatus === false) continue; // 跳过文件

        // 单个路径值(且是目录)
        totalPaths++;
        const exists = window.services.checkPathExists(value);
        // 清理 file: 前缀用于显示
        const cleanPath = value.replace(/^file:/, '');
        if (exists) {
          existCount++;
        } else {
          notExistCount++;
          notExistDetails.push({
            varName: envVar.name,
            path: cleanPath
          });
        }
      }
    }

    // 显示检测结果
    Modal.info({
      title: '全局路径检测结果',
      width: 700,
      content: h('div', {}, [
        h('div', { style: { marginBottom: '16px' } }, [
          h('p', { style: { marginBottom: '8px' } }, `检测到 ${totalPaths} 个路径`),
          h('p', { style: { marginBottom: '8px', color: '#52c41a', fontWeight: 'bold' } }, `✓ 存在: ${existCount} 个`),
          h('p', { style: { marginBottom: '8px', color: '#ff4d4f', fontWeight: 'bold' } }, `✗ 不存在: ${notExistCount} 个`)
        ]),
        notExistDetails.length > 0 ? h('div', { style: { marginTop: '16px' } }, [
          h('h4', { style: { marginBottom: '8px' } }, '不存在的路径详情:'),
          h('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
            notExistDetails.map(item =>
              h('div', { style: { marginBottom: '12px', padding: '8px', borderRadius: '4px' } }, [
                h('div', { style: { fontSize: '12px', color: '#666', marginBottom: '4px' } }, `变量: ${item.varName}`),
                h('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, item.path)
              ])
            )
          )
        ]) : h('div', { style: { marginTop: '16px', padding: '12px', backgroundColor: '#f6ffed', borderRadius: '4px', color: '#52c41a' } },
          '🎉 所有路径都存在！'
        )
      ])
    });
  } catch (error) {
    message.error(`路径检测失败: ${error.message}`);
    console.error('Error checking paths:', error);
  } finally {
    pathChecking.value = false;
  }
}

// 配置子输入框的函数
function setupSubInput() {
  if (window.utools && window.utools.setSubInput) {
    window.utools.setSubInput(({ text }) => {
      searchKeyword.value = text;
      // 搜索时自动展开所有面板
      if (text) {
        activeKeys.value = ['system', 'user'];
      }
    }, '搜索环境变量...');
  }
}

// 监听插件进入事件
watch(() => props.enterAction, (newAction) => {
  if (newAction && Object.keys(newAction).length > 0) {
    // 插件每次进入时重新配置子输入框
    setupSubInput();
  }
}, { immediate: true, deep: true });

// 初始化
onMounted(() => {
  checkAdminPrivileges();
  loadEnvVars();
  // 初始化时也配置一次子输入框
  setupSubInput();
  // 检查是否首次使用
  checkFirstTimeUse();
});
</script>

<style scoped>
.env-manager {
  height: 90vh;
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--ant-color-border);
}

.content {
  border-radius: 8px;
  border: 1px solid var(--ant-color-border);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.vars-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}


.table-container .clickable {
  cursor: pointer;
  transition: opacity 0.2s;
}

.table-container .clickable:hover {
  opacity: 0.7;
}

.table-container .clickable:active {
  opacity: 0.5;
}

:deep(.ant-collapse-header) {
  padding: 16px !important;
}

:deep(.ant-collapse-content-box) {
  padding: 0 16px !important;
}

:deep(.ant-card-body) {
  padding-right: 0;
}
</style>
