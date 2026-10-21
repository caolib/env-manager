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
              <div>当前非管理员身份，修改系统变量时将弹出 UAC 授权窗口</div>
            </div>
          </template>
          <a-tag color="processing">
            <WarningOutlined /> 非管理员
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
        <!-- 系统 Path 变量 -->
        <a-collapse-panel key="systemPath">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <WindowsOutlined />
                系统 Path 变量
                <a-tag>{{ systemPathVars.length }}</a-tag>
              </span>
            </div>
          </template>

          <div v-if="filteredSystemPathVars.length > 0" class="path-table-stack">
            <a-collapse v-model:activeKey="systemPathVarActiveKeys" :bordered="false" class="path-var-collapse">
              <a-collapse-panel v-for="row in filteredSystemPathVars" :key="getPathVarPanelKey('system', row)">
                <template #header>
                  <div class="path-var-panel-header">
                    <div class="path-var-panel-title">
                      <span class="path-var-panel-name">{{ row.name }}</span>
                      <a-tag>{{ getPathVarItemCount(row) }} 项</a-tag>
                    </div>
                    <div class="path-panel-actions" @click.stop>
                      <a-button v-if="isPathTableDirty('system', row)" size="small" type="primary"
                        @click="runPathTableAction('system', row, 'savePath')">保存</a-button>
                      <a-button v-if="isPathTableDirty('system', row)" size="small"
                        @click="runPathTableAction('system', row, 'resetPaths')">取消</a-button>
                      <a-button size="small" @click="runPathTableAction('system', row, 'checkEditPaths')">路径检测</a-button>
                      <a-button v-if="isPathTableDirty('system', row)" size="small" class="path-diff-ready"
                        @click="runPathTableAction('system', row, 'showDiff')">diff</a-button>
                      <a-button size="small" @click="runPathTableAction('system', row, 'addPath')">
                        <PlusOutlined />
                        添加路径
                      </a-button>
                    </div>
                  </div>
                </template>

                <PathVarTable :ref="el => setPathTableRef('system', row, el)" :env-var="row" :disabled="row.disabled"
                  :highlight="searchKeyword" hide-header embedded
                  @delete="(row) => deleteVarDirect(row, 'system')"
                  @saveDirect="(row) => saveDirectVar(row, 'system')" />
              </a-collapse-panel>
            </a-collapse>
          </div>
          <div v-else class="empty-path-section">未找到系统 Path 变量</div>
        </a-collapse-panel>

        <!-- 用户 Path 变量 -->
        <a-collapse-panel key="userPath">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <UserOutlined />
                用户 Path 变量
                <a-tag>{{ userPathVars.length }}</a-tag>
              </span>
            </div>
          </template>

          <div v-if="filteredUserPathVars.length > 0" class="path-table-stack">
            <a-collapse v-model:activeKey="userPathVarActiveKeys" :bordered="false" class="path-var-collapse">
              <a-collapse-panel v-for="row in filteredUserPathVars" :key="getPathVarPanelKey('user', row)">
                <template #header>
                  <div class="path-var-panel-header">
                    <div class="path-var-panel-title">
                      <span class="path-var-panel-name">{{ row.name }}</span>
                      <a-tag>{{ getPathVarItemCount(row) }} 项</a-tag>
                    </div>
                    <div class="path-panel-actions" @click.stop>
                      <a-button v-if="isPathTableDirty('user', row)" size="small" type="primary"
                        @click="runPathTableAction('user', row, 'savePath')">保存</a-button>
                      <a-button v-if="isPathTableDirty('user', row)" size="small"
                        @click="runPathTableAction('user', row, 'resetPaths')">取消</a-button>
                      <a-button size="small" @click="runPathTableAction('user', row, 'checkEditPaths')">路径检测</a-button>
                      <a-button v-if="isPathTableDirty('user', row)" size="small" class="path-diff-ready"
                        @click="runPathTableAction('user', row, 'showDiff')">diff</a-button>
                      <a-button size="small" @click="runPathTableAction('user', row, 'addPath')">
                        <PlusOutlined />
                        添加路径
                      </a-button>
                    </div>
                  </div>
                </template>

                <PathVarTable :ref="el => setPathTableRef('user', row, el)" :env-var="row" :disabled="row.disabled"
                  :highlight="searchKeyword" hide-header embedded
                  @delete="(row) => deleteVarDirect(row, 'user')" @saveDirect="(row) => saveDirectVar(row, 'user')" />
              </a-collapse-panel>
            </a-collapse>
          </div>
          <div v-else class="empty-path-section">未找到用户 Path 变量</div>
        </a-collapse-panel>

        <!-- 系统环境变量 -->
        <a-collapse-panel key="system">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <WindowsOutlined />
                系统环境变量
                <a-tag>{{ systemNormalVars.length }}</a-tag>
              </span>
              <a-button size="small" type="primary" @click.stop="showAddSystemDialog">
                <PlusOutlined />
                添加
              </a-button>
            </div>
          </template>

          <!-- 卡片模式 -->
          <div v-if="settingsStore.layoutMode.value === 'card'" class="vars-container">
            <EnvVarCard v-for="row in filteredSystemVars" :key="row.name" :env-var="row" :highlight="searchKeyword"
              :disabled="row.disabled" :is-readonly="false"
              :sensitive-fields-enabled="settingsStore.sensitiveFieldsEnabled.value"
              :sensitive-keywords="settingsStore.sensitiveKeywords.value" @edit="(row) => editVar(row, 'system')"
              @delete="(row) => deleteVar(row, 'system')" @saveDirect="(row) => saveDirectVar(row, 'system')" />
          </div>

          <!-- 表格模式 -->
          <div v-else class="table-container">
            <a-table :dataSource="filteredSystemVars" :columns="tableColumns" :pagination="systemEnvTablePagination"
              size="small" :rowKey="(record) => record.name" :scroll="{ x: 'max-content' }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="clickable" @click="copyText(record.name)" title="点击复制">
                    <HighlightText :text="record.name" :keyword="searchKeyword" />
                  </span>
                  <a-tag v-if="record.disabled" color="default" style="margin-left: 8px;">禁用</a-tag>
                </template>
                <template v-else-if="column.key === 'value'">
                  <span class="clickable" @click="copyText(record.value)" title="点击复制">
                    <HighlightText :text="renderValue(record)" :keyword="searchKeyword" />
                  </span>
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
                    <a-button size="small" type="link" @click="editVar(record, 'system')">
                      <EditOutlined />
                    </a-button>
                    <a-popconfirm title="确定要删除该变量吗？" ok-text="确定" cancel-text="取消"
                      @confirm="deleteVar(record, 'system')">
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

        <!-- 用户环境变量 -->
        <a-collapse-panel key="user">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <UserOutlined />
                用户环境变量
                <a-tag>{{ userNormalVars.length }}</a-tag>
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
              @delete="(row) => deleteVar(row, 'user')" @saveDirect="(row) => saveDirectVar(row, 'user')" />
          </div>

          <!-- 表格模式 -->
          <div v-else class="table-container">
            <a-table :dataSource="filteredUserVars" :columns="tableColumns" :pagination="userEnvTablePagination"
              size="small" :rowKey="(record) => record.name" :scroll="{ x: 'max-content' }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="clickable" @click="copyText(record.name)" title="点击复制">
                    <HighlightText :text="record.name" :keyword="searchKeyword" />
                  </span>
                  <a-tag v-if="record.disabled" color="default" style="margin-left: 8px;">禁用</a-tag>
                </template>
                <template v-else-if="column.key === 'value'">
                  <span class="clickable" @click="copyText(record.value)" title="点击复制">
                    <HighlightText :text="renderValue(record)" :keyword="searchKeyword" />
                  </span>
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

        <a-alert v-if="formData.scope === 'system' && !isAdmin" message="修改系统环境变量将弹出 UAC 授权窗口" type="info" show-icon />
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h, defineComponent } from 'vue';
import { Checkbox, message, Modal } from '../ui';
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
import HighlightText from './HighlightText.vue';
import PathVarTable from './PathVarTable.vue';
import { useSettingsStore } from '../stores/settings';
import { useAlternativesStore } from '../stores/alternatives';
import { getData, setData } from '../utils/store';
import { exportBackupFile, exportAfterVariableChange } from '../utils/configBackup';
import { isSemicolonSeparatedValue, isSemicolonSeparatedVar } from '../utils/pathVar';

const props = defineProps({
  enterAction: {
    type: Object,
    default: () => ({})
  }
});

const settingsStore = useSettingsStore();
const alternativesStore = useAlternativesStore();
const envTablePageSizeOptions = [10, 20, 50, 100];
const systemEnvTablePagination = {
  pageSize: 20,
  showSizeChanger: true,
  pageSizeOptions: envTablePageSizeOptions,
  pageSizeStorageKey: 'home-system-vars'
};
const userEnvTablePagination = {
  pageSize: 20,
  showSizeChanger: true,
  pageSizeOptions: envTablePageSizeOptions,
  pageSizeStorageKey: 'home-user-vars'
};

// 禁用变量存储
const DISABLED_VARS_KEY = 'env-manager-disabled-vars-v1';
const disabledVarsState = ref(loadDisabledVars());

function normalizeScope(scope) {
  return scope === 'system' ? 'system' : 'user';
}

function getAlternatives(scope, name) {
  return alternativesStore.getAlternatives(scope, name);
}

function setAlternatives(scope, name, list) {
  return alternativesStore.setAlternatives(scope, name, list);
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

// function isVarDisabled(scope, name) {
//   return getDisabledVar(scope, name) !== null;
// }


function moveAlternatives(scope, fromName, toName) {
  alternativesStore.moveAlternatives(scope, fromName, toName);
}

// function mergeAlternatives(baseList, incomingList) {
//   const result = [];
//   const seen = new Set();
//   const pushItem = (it) => {
//     const value = (it?.value ?? '').toString();
//     if (!value) return;
//     if (seen.has(value)) return;
//     seen.add(value);
//     result.push({ value, note: (it?.note ?? '').toString() });
//   };
//   [...incomingList, ...baseList].forEach(pushItem);
//   return result;
// }

function ensureAlternativeExists(scope, name, value, note = '') {
  const varName = (name || '').trim();
  const v = (value ?? '').toString();
  if (!varName || !v) return;
  if (isPathVarValue(varName, v)) return;

  alternativesStore.addAlternative(scope, varName, v, note);
}

// 状态
const systemVars = ref([]);
const userVars = ref([]);
const searchKeyword = ref('');
const loading = ref(false);
const submitting = ref(false);
const isAdmin = ref(false);
const activeKeys = ref([]); // 默认折叠所有主页面板
const systemPathVarActiveKeys = ref([]);
const userPathVarActiveKeys = ref([]);
const pathTableRefs = ref({});
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
function isPathVarValue(name, value) {
  return isSemicolonSeparatedVar(name, value);
}

const showAlternativesSection = computed(() => {
  // 仅对普通变量显示；Path 变量不显示
  // 普通变量始终显示输入区域
  if (!formData.value.name?.trim() || isPathVarValue(formData.value.name, formData.value.value)) {
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
  return !!formData.value.name?.trim() && !!altValueInput.value.trim() && !isPathVarValue(formData.value.name, formData.value.value);
});

function addAlternative() {
  const name = formData.value.name?.trim();
  if (!name) return;
  if (isPathVarValue(formData.value.name, formData.value.value)) return;

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
const mergedSystemVars = computed(() => {
  return mergeVars(systemVars.value, 'system');
});

const mergedUserVars = computed(() => {
  return mergeVars(userVars.value, 'user');
});

const systemPathVars = computed(() => {
  return mergedSystemVars.value.filter(isPathVar);
});

const userPathVars = computed(() => {
  return mergedUserVars.value.filter(isPathVar);
});

const systemNormalVars = computed(() => {
  return mergedSystemVars.value.filter(v => !isPathVar(v));
});

const userNormalVars = computed(() => {
  return mergedUserVars.value.filter(v => !isPathVar(v));
});

const filteredSystemVars = computed(() => {
  return filterAndSortVars(systemNormalVars.value);
});

const filteredUserVars = computed(() => {
  return filterAndSortVars(userNormalVars.value);
});

const filteredSystemPathVars = computed(() => {
  return filterAndSortVars(systemPathVars.value);
});

const filteredUserPathVars = computed(() => {
  return filterAndSortVars(userPathVars.value);
});

function getPathVarPanelKey(scope, row) {
  return `${scope}:${row.name}`;
}

function isMainPathVar(row) {
  return row.name?.trim().toLowerCase() === 'path';
}

function getDefaultPathVarActiveKeys(vars, scope) {
  return vars
    .filter(isMainPathVar)
    .map(row => getPathVarPanelKey(scope, row));
}

function getPathVarItemCount(row) {
  return (row.value || '').split(';').filter(Boolean).length;
}

function getPathTableRefKey(scope, row) {
  return getPathVarPanelKey(scope, row);
}

function setPathTableRef(scope, row, el) {
  const key = getPathTableRefKey(scope, row);
  if (el) {
    pathTableRefs.value[key] = el;
  } else {
    delete pathTableRefs.value[key];
  }
}

function getPathTableRef(scope, row) {
  return pathTableRefs.value[getPathTableRefKey(scope, row)];
}

function isPathTableDirty(scope, row) {
  return !!getPathTableRef(scope, row)?.isDirty;
}

function runPathTableAction(scope, row, action) {
  getPathTableRef(scope, row)?.[action]?.();
}

watch(filteredSystemPathVars, (vars) => {
  systemPathVarActiveKeys.value = getDefaultPathVarActiveKeys(vars, 'system');
}, { immediate: true });

watch(filteredUserPathVars, (vars) => {
  userPathVarActiveKeys.value = getDefaultPathVarActiveKeys(vars, 'user');
}, { immediate: true });

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
  if (isSemicolonSeparatedValue(trimmed)) {
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
  if (isSemicolonSeparatedValue(trimmed)) {
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

// 合并变量（激活的 + 禁用的）
function mergeVars(activeVars, scope) {
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
  return [...activeFiltered, ...disabled];
}

function filterAndSortVars(vars) {
  // 1. 应用搜索过滤
  let filtered = vars;
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    filtered = vars.filter(v => {
      return v.name.toLowerCase().includes(keyword) || v.value.toLowerCase().includes(keyword);
    });
  }

  // 2. 排序：启用变量 -> 禁用变量；同状态下普通变量在前，Path 变量在后
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
// function filterVars(vars) {
//   let filtered = vars;
//   if (searchKeyword.value) {
//     const keyword = searchKeyword.value.toLowerCase();
//     filtered = vars.filter(v => {
//       return v.name.toLowerCase().includes(keyword) || v.value.toLowerCase().includes(keyword);
//     });
//   }

//   // 将 path 变量排在最后
//   return filtered.sort((a, b) => {
//     const aIsPath = isPathVar(a);
//     const bIsPath = isPathVar(b);
//     if (aIsPath === bIsPath) return 0;
//     return aIsPath ? 1 : -1;
//   });
// }

// 判断是否为 path 变量（分号分隔的多路径）
function isPathVar(envVar) {
  return isSemicolonSeparatedVar(envVar.name, envVar.value);
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
    const result = exportBackupFile('env-manager-初始备份', { reveal: true });
    if (result.success) {
      message.success(`备份已导出到: ${result.path}`);
    } else if (result.message !== '用户取消保存') {
      message.error(`导出失败: ${result.message}`);
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
  } catch (error) {
    console.error('检查管理员权限失败:', error);
    isAdmin.value = false;
  }
}

// 以管理员身份重启
// function restartAsAdmin() {
//   Modal.confirm({
//     title: '以管理员身份重启',
//     content: 'uTools 将重新启动,当前会话将关闭。是否继续?',
//     okText: '确定',
//     cancelText: '取消',
//     onOk() {
//       try {
//         window.services.restartAsAdmin();
//         message.success('正在重启...');
//       } catch (error) {
//         console.error('重启失败:', error);
//         message.error('重启失败: ' + error.message);
//       }
//     }
//   });
// }

// 显示添加对话框
// 重置备用值相关状态
function resetAlternativesState() {
  altValueInput.value = '';
  altNoteInput.value = '';
  editingNoteIndex.value = -1;
  editingNoteValue.value = '';
}

function showAddSystemDialog() {
  formData.value = { name: '', value: '', scope: 'system', disabled: false };
  editMode.value = false;
  resetAlternativesState();
  showDialog.value = true;
}

function showAddUserDialog() {
  formData.value = { name: '', value: '', scope: 'user', disabled: false };
  editMode.value = false;
  resetAlternativesState();
  showDialog.value = true;
}

// 编辑变量
function editVar(row, scope) {
  // 如果是 PATH 变量（分号分隔的值）且当前在表格模式，切换到卡片模式
  if (settingsStore.layoutMode.value === 'table' && isPathVarValue(row.name, row.value)) {
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

  // 重置备用值编辑状态，确保列表能正确显示
  resetAlternativesState();

  showDialog.value = true;

  // 进入编辑弹窗时，把当前值自动纳入备用值（仅普通变量）
  ensureAlternativeExists(scope, row.name, row.value);
}

// 取消编辑
function cancelEdit() {
  showDialog.value = false;
  formData.value = { name: '', value: '', scope: 'user', disabled: false };
  kvInput.value = '';
  editMode.value = false;
  originalVarName.value = '';
  resetAlternativesState();
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
      } catch {
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
      } catch {
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
    formData.value = { name: '', value: '', scope: 'user', disabled: false };
    kvInput.value = '';
    editMode.value = false;
    originalVarName.value = '';
    resetAlternativesState();
    await loadEnvVars();
    await exportAfterVariableChange();
  } catch (error) {
    const action = editMode.value ? '更新' : '添加';
    message.error(`${action}失败: ${error.message}`);
    console.error('Error saving env var:', error);
  } finally {
    submitting.value = false;
  }
}

// 直接保存变量（绕过表单对话框）
async function saveDirectVar(row, scope) {
  try {
    const isSystem = scope === 'system';

    // 如果原来是禁用的，仅更新 disabled 存储
    const disabledInfo = getDisabledVar(scope, row.name);
    if (disabledInfo) {
      setDisabledVar(scope, row.name, row.value);
    } else {
      // 启用的，直接 setEnvVar
      await window.services.setEnvVar(row.name, row.value, isSystem);
    }

    message.success(`变量 "${row.name}" 更新成功${disabledInfo ? '（已禁用）' : ''}`);
    await loadEnvVars();
    await exportAfterVariableChange();
  } catch (error) {
    message.error(`更新失败: ${error.message}`);
    console.error('Error direct saving env var:', error);
  }
}

// 删除变量
async function deleteVar(row, scope) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除变量 "${row.name}" 吗？此操作将从注册表和插件存储中永久删除该变量。`,
    onOk: async () => deleteVarDirect(row, scope)
  });
}

async function deleteVarDirect(row, scope) {
  try {
    // 删除注册表中的变量
    try {
      await window.services.deleteEnvVar(row.name, scope === 'system');
    } catch {
      // 忽略删除失败（可能是禁用状态）
    }
    // 删除禁用存储
    removeDisabledVar(scope, row.name);
    // 同步清理备用值
    alternativesStore.removeAllAlternatives(scope, row.name);
    message.success(`变量 "${row.name}" 删除成功`);
    await loadEnvVars();
    await exportAfterVariableChange();
  } catch (error) {
    message.error(`删除失败: ${error.message}`);
    console.error('Error deleting env var:', error);
  }
}


function getPathItems(value) {
  return String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean);
}

function createPathCheckSummary(totalPaths, existCount, notExistCount) {
  return h('div', { style: { marginBottom: '16px' } }, [
    h('p', { style: { marginBottom: '8px' } }, `检测到 ${totalPaths} 个路径`),
    h('p', { style: { marginBottom: '8px', color: '#52c41a', fontWeight: 'bold' } }, `✓ 存在: ${existCount} 个`),
    h('p', { style: { marginBottom: '8px', color: '#ff4d4f', fontWeight: 'bold' } }, `✗ 不存在: ${notExistCount} 个`)
  ]);
}

async function removeCheckedMissingPaths(items) {
  let removedVars = 0;
  let removedPathItems = 0;

  const varItems = items.filter(item => item.type === 'variable');
  const pathItems = items.filter(item => item.type === 'path-item');

  for (const item of varItems) {
    try {
      try {
        await window.services.deleteEnvVar(item.varName, item.scope === 'system');
      } catch {
        // 忽略删除失败（可能是禁用状态）
      }
      removeDisabledVar(item.scope, item.varName);
      alternativesStore.removeAllAlternatives(item.scope, item.varName);
      removedVars++;
    } catch (error) {
      console.error(`删除变量 ${item.varName} 失败:`, error);
    }
  }

  const groupedPathItems = pathItems.reduce((groups, item) => {
    const key = `${item.scope}:${item.varName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        scope: item.scope,
        varName: item.varName,
        items: []
      });
    }
    groups.get(key).items.push(item);
    return groups;
  }, new Map());

  for (const group of groupedPathItems.values()) {
    const { scope, varName, items: groupItems } = group;
    const sourceVars = scope === 'system' ? systemVars.value : userVars.value;
    const currentVar = sourceVars.find(item => item.name === varName);
    if (!currentVar) continue;

    const removePaths = new Set(groupItems.map(item => item.rawPath));
    const currentPaths = getPathItems(currentVar.value);
    const nextPaths = currentPaths.filter(path => !removePaths.has(path));
    if (nextPaths.length === currentPaths.length) continue;

    try {
      await window.services.setEnvVar(currentVar.name, nextPaths.join(';'), scope === 'system');
      removedPathItems += currentPaths.length - nextPaths.length;
    } catch (error) {
      console.error(`清理 Path 变量 ${currentVar.name} 失败:`, error);
    }
  }

  if (removedVars > 0 || removedPathItems > 0) {
    await loadEnvVars();
    await exportAfterVariableChange();
    message.success(`已删除 ${removedVars} 个变量、${removedPathItems} 个 Path 路径项`);
  } else {
    message.info('未删除任何路径');
  }
}

function showGlobalPathCleanupModal(totalPaths, existCount, notExistCount, notExistDetails) {
  const selectedKeys = ref(notExistDetails.map(item => item.key));

  const GlobalPathCleanupContent = defineComponent({
    name: 'GlobalPathCleanupContent',
    setup() {
      const allSelected = computed(() => selectedKeys.value.length === notExistDetails.length);
      const indeterminate = computed(() => selectedKeys.value.length > 0 && selectedKeys.value.length < notExistDetails.length);

      function toggleAll(event) {
        selectedKeys.value = event.target.checked ? notExistDetails.map(item => item.key) : [];
      }

      function toggleOne(key, checked) {
        if (checked) {
          selectedKeys.value = selectedKeys.value.includes(key) ? selectedKeys.value : [...selectedKeys.value, key];
        } else {
          selectedKeys.value = selectedKeys.value.filter(item => item !== key);
        }
      }

      function renderItemCheckbox(item, content) {
        return h(Checkbox, {
          checked: selectedKeys.value.includes(item.key),
          onChange: event => toggleOne(item.key, event.target.checked)
        }, () => content);
      }

      function renderPlainVariableSection(items) {
        if (items.length === 0) return null;

        return h('div', { style: { marginBottom: '12px' } }, [
          h('div', { style: { marginBottom: '6px', color: '#666', fontSize: '12px', fontWeight: 'bold' } }, `普通变量 (${items.length})`),
          ...items.map(item =>
            h('div', { style: { marginBottom: '8px', paddingLeft: '8px' } }, [
              renderItemCheckbox(item, h('div', { style: { display: 'inline-flex', flexDirection: 'column', gap: '2px', verticalAlign: 'top' } }, [
                h('span', { style: { fontSize: '12px', color: '#666' } }, item.varName),
                h('span', { style: { fontSize: '12px', wordBreak: 'break-all' } }, item.path)
              ]))
            ])
          )
        ]);
      }

      function renderPathVariableSection(items) {
        if (items.length === 0) return null;

        const groupedByVar = items.reduce((groups, item) => {
          if (!groups.has(item.varName)) groups.set(item.varName, []);
          groups.get(item.varName).push(item);
          return groups;
        }, new Map());

        return h('div', { style: { marginBottom: '12px' } }, [
          h('div', { style: { marginBottom: '6px', color: '#666', fontSize: '12px', fontWeight: 'bold' } }, `Path 变量 (${items.length})`),
          ...Array.from(groupedByVar.entries()).map(([varName, varItems]) =>
            h('div', { style: { marginBottom: '10px', paddingLeft: '8px' } }, [
              h('div', { style: { marginBottom: '4px', color: '#666', fontSize: '12px' } }, varName),
              ...varItems.map(item =>
                h('div', { style: { marginBottom: '6px', paddingLeft: '12px' } }, [
                  renderItemCheckbox(item, h('span', { style: { fontSize: '12px', wordBreak: 'break-all' } }, item.path))
                ])
              )
            ])
          )
        ]);
      }

      function renderScopeSection(scope) {
        const scopeItems = notExistDetails.filter(item => item.scope === scope);
        if (scopeItems.length === 0) return null;

        const plainItems = scopeItems.filter(item => item.type === 'variable');
        const pathVarItems = scopeItems.filter(item => item.type === 'path-item');

        return h('div', { style: { marginBottom: '14px' } }, [
          h('div', {
            style: {
              marginBottom: '8px',
              padding: '4px 8px',
              borderRadius: '4px',
              background: 'var(--ant-color-fill-quaternary)',
              fontWeight: 'bold'
            }
          }, `${scope === 'system' ? '系统' : '用户'} (${scopeItems.length})`),
          renderPlainVariableSection(plainItems),
          renderPathVariableSection(pathVarItems)
        ]);
      }

      return () => h('div', {}, [
        createPathCheckSummary(totalPaths, existCount, notExistCount),
        h('div', { style: { marginBottom: '8px' } }, [
          h(Checkbox, {
            checked: allSelected.value,
            indeterminate: indeterminate.value,
            onChange: toggleAll
          }, () => `全选 (${selectedKeys.value.length}/${notExistDetails.length})`)
        ]),
        h('div', { style: { maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--ant-color-border)', borderRadius: '4px', padding: '8px' } },
          ['system', 'user'].map(renderScopeSection).filter(Boolean)
        )
      ]);
    }
  });

  Modal.confirm({
    title: '全局路径检测结果',
    width: 760,
    content: h(GlobalPathCleanupContent),
    okText: '删除选中项',
    cancelText: '保留',
    onOk: async () => {
      const selectedItems = notExistDetails.filter(item => selectedKeys.value.includes(item.key));
      await removeCheckedMissingPaths(selectedItems);
    }
  });
}

// 全局路径检测
async function checkAllPaths() {
  pathChecking.value = true;

  try {
    const allVars = [
      ...systemVars.value.map(envVar => ({ envVar, scope: 'system' })),
      ...userVars.value.map(envVar => ({ envVar, scope: 'user' }))
    ];
    let totalPaths = 0;
    let existCount = 0;
    let notExistCount = 0;
    const notExistDetails = [];

    for (const { envVar, scope } of allVars) {
      const value = envVar.value?.trim();
      if (!value) continue;

      if (isPathVar(envVar)) {
        getPathItems(value).forEach((path, index) => {
          if (!window.services?.isPathLike(path)) return;

          totalPaths++;
          const exists = window.services.checkPathExists(path);
          if (exists) {
            existCount++;
          } else {
            notExistCount++;
            notExistDetails.push({
              key: `${scope}:${envVar.name}:path:${index}:${path}`,
              type: 'path-item',
              scope,
              varName: envVar.name,
              path,
              rawPath: path
            });
          }
        });
        continue;
      }

      if (window.services?.isPathLike(value)) {
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
            key: `${scope}:${envVar.name}:variable`,
            type: 'variable',
            scope,
            varName: envVar.name,
            path: cleanPath,
            rawPath: value
          });
        }
      }
    }

    if (notExistDetails.length > 0) {
      showGlobalPathCleanupModal(totalPaths, existCount, notExistCount, notExistDetails);
      return;
    }

    Modal.info({
      title: '全局路径检测结果',
      width: 700,
      content: h('div', {}, [
        createPathCheckSummary(totalPaths, existCount, notExistCount),
        h('div', { style: { marginTop: '16px', padding: '12px', backgroundColor: '#f6ffed', borderRadius: '4px', color: '#52c41a' } },
          '所有路径都存在！'
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
  if (window.ztools && window.ztools.setSubInput) {
    window.ztools.setSubInput(({ text }) => {
      searchKeyword.value = text;
      // 搜索时自动展开所有面板
      if (text) {
        activeKeys.value = ['systemPath', 'userPath', 'system', 'user'];
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
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
}

.vars-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.path-table-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
}

.path-diff-ready {
  border-color: rgba(250, 173, 20, 0.75);
  background: rgba(250, 173, 20, 0.16);
  color: var(--ui-warning);
  font-weight: 700;
}

.path-var-collapse {
  width: 100%;
}

.path-var-collapse :deep(.ui-collapse-panel) {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-muted);
}

.path-var-collapse :deep(.ui-collapse-header) {
  background: var(--ui-surface-muted);
}

.path-var-collapse :deep(.ui-collapse-content) {
  padding: 10px;
  background: var(--ui-surface);
}

.path-table-stack :deep(.path-var-table) {
  background: var(--ui-surface);
}

.path-var-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.path-var-panel-title {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  min-width: 0;
}

.path-var-panel-name {
  font-weight: 600;
}

.empty-path-section {
  padding: 10px 12px;
  border: 1px dashed var(--ant-color-border);
  border-radius: 6px;
  color: var(--ant-color-text-tertiary);
  font-size: 13px;
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
