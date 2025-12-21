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
          <div class="vars-container">
            <EnvVarCard v-for="row in filteredSystemVars" :key="row.name" :env-var="row" :highlight="searchKeyword"
              :is-readonly="!isAdmin" :sensitive-fields-enabled="settingsStore.sensitiveFieldsEnabled.value"
              :sensitive-keywords="settingsStore.sensitiveKeywords.value"
              @edit="(row) => editVar(row, 'system')"
              @delete="(row) => deleteVar(row, 'system')" />
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
          <div class="vars-container">
            <EnvVarCard v-for="row in filteredUserVars" :key="row.name" :env-var="row" :highlight="searchKeyword"
              :sensitive-fields-enabled="settingsStore.sensitiveFieldsEnabled.value"
              :sensitive-keywords="settingsStore.sensitiveKeywords.value"
              @edit="(row) => editVar(row, 'user')" @delete="(row) => deleteVar(row, 'user')" />
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>

    <!-- 添加/编辑对话框 -->
    <a-modal v-model:open="showDialog" :title="editMode ? '编辑环境变量' : '添加环境变量'" @ok="handleSubmit" @cancel="cancelEdit"
      :confirmLoading="submitting" width="600px">
      <a-form :model="formData" layout="vertical">
        <!-- KV 格式快捷输入 -->
        <a-form-item label="输入键值对 (key=value)">
          <a-input v-model:value="kvInput" placeholder="例如: MY_VAR=value" @input="parseKVInput" />
        </a-form-item>

        <a-form-item label="变量名" required>
          <a-input v-model:value="formData.name" placeholder="输入变量名" />
        </a-form-item>

        <a-form-item label="变量值" required>
          <a-textarea v-model:value="formData.value" placeholder="输入变量值" :rows="8" />
        </a-form-item>

        <a-alert v-if="formData.scope === 'system'" message="修改系统环境变量需要管理员权限" type="warning" show-icon />
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined,
  ReloadOutlined,
  WindowsOutlined,
  UserOutlined,
  WarningOutlined,
  CheckOutlined
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
  scope: 'user'
});

// 计算属性：过滤后的变量
const filteredSystemVars = computed(() => {
  return filterVars(systemVars.value);
});

const filteredUserVars = computed(() => {
  return filterVars(userVars.value);
});

// 过滤函数
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
      version: '1.0.0',
      exportTime: beijingTime.toISOString(),
      settings: {
        theme: settingsStore.theme.value
      },
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
  formData.value = { name: '', value: '', scope: 'system' };
  editMode.value = false;
  showDialog.value = true;
}

function showAddUserDialog() {
  formData.value = { name: '', value: '', scope: 'user' };
  editMode.value = false;
  showDialog.value = true;
}

// 编辑变量
function editVar(row, scope) {
  formData.value = {
    name: row.name,
    value: row.value,
    scope: scope
  };
  originalVarName.value = row.name;
  editMode.value = true;
  showDialog.value = true;
}

// 取消编辑
function cancelEdit() {
  showDialog.value = false;
  formData.value = { name: '', value: '', scope: 'user' };
  kvInput.value = '';
  editMode.value = false;
  originalVarName.value = '';
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

  // 检查是否已存在
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
    // 如果是编辑模式且变量名发生了变化，先删除旧的
    if (editMode.value && originalVarName.value !== formData.value.name) {
      await window.services.deleteEnvVar(
        originalVarName.value,
        formData.value.scope === 'system'
      );
    }

    // 设置新的环境变量
    await window.services.setEnvVar(
      formData.value.name,
      formData.value.value,
      formData.value.scope === 'system'
    );

    const action = editMode.value ? '更新' : '添加';
    message.success(`变量 "${formData.value.name}" ${action}成功`);

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
    content: `确定要删除变量 "${row.name}" 吗？`,
    onOk: async () => {
      try {
        await window.services.deleteEnvVar(row.name, scope === 'system');
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
    const { h } = await import('vue');
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
              h('div', { style: { marginBottom: '12px', padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' } }, [
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

:deep(.ant-collapse-header) {
  padding: 16px !important;
}

:deep(.ant-collapse-content-box) {
  padding: 0 16px !important;
}
</style>
