<script setup>
import { onMounted, ref, watch, computed, provide } from 'vue';
import { Modal } from './ui';
import { HomeOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons-vue';
import HomeView from './components/HomeView.vue';
import ConfigView from './components/ConfigView.vue';
import GroupView from './components/GroupView.vue';
import { useSettingsStore } from './stores/settings';

const currentView = ref('home');
const enterAction = ref({});
const configAction = ref(null);
const settingsStore = useSettingsStore();
let backupPromptOpen = false;
let backupCheckTimer = null;
let configActionId = 0;

// 主题相关
const systemDarkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

// 计算实际使用的主题
const actualTheme = computed(() => {
  if (settingsStore.theme.value === 'system') {
    return systemDarkMode.value ? 'dark' : 'light';
  }
  return settingsStore.theme.value;
});

// 提供主题模式给子组件
provide('themeMode', actualTheme);

// 应用主题到document
const applyTheme = () => {
  // eslint-disable-next-line no-undef
  document.documentElement.setAttribute('data-theme', actualTheme.value);
};

// 监听主题变化
watch(actualTheme, () => {
  applyTheme();
});

// 应用自定义主题色与字体族
const applyAppearance = () => {
  const root = document.documentElement;
  root.style.setProperty('--brand', settingsStore.primaryColor.value);
  root.style.setProperty('--font-ui', settingsStore.fontFamily.value);
};

watch(
  () => [settingsStore.primaryColor.value, settingsStore.fontFamily.value],
  applyAppearance,
  { immediate: true }
);

const navItems = [
  {
    key: 'home',
    label: '主页',
    icon: HomeOutlined,
  },
  {
    key: 'group',
    label: '变量组',
    icon: AppstoreOutlined,
  },
  {
    key: 'config',
    label: '配置',
    icon: SettingOutlined,
  },
];

// Note: 功能命令需要在具体插件模板中自行注册，模板保留主题与配置逻辑

function openBackupSetupPrompt(title, content, action = null) {
  if (backupPromptOpen || currentView.value === 'config') return;

  backupPromptOpen = true;
  Modal.confirm({
    title,
    content,
    okText: '去配置',
    cancelText: '稍后',
    onOk() {
      currentView.value = 'config';
      if (action) {
        configActionId += 1;
        configAction.value = { ...action, id: configActionId };
      }
      backupPromptOpen = false;
    },
    onCancel() {
      backupPromptOpen = false;
    }
  });
}

function checkBackupSetupOnStartup() {
  if (backupCheckTimer) {
    window.clearTimeout(backupCheckTimer);
  }

  backupCheckTimer = window.setTimeout(() => {
    const exportFolder = settingsStore.defaultExportFolder.value?.trim();

    if (!exportFolder) {
      openBackupSetupPrompt(
        '设置默认导出文件夹',
        '还没有设置默认导出文件夹。建议先设置一个固定目录，后续备份和导入都会在这里管理。',
        { type: 'selectExportFolder' }
      );
      return;
    }

    if (!window.services?.listExportConfigFiles) return;

    try {
      const result = window.services.listExportConfigFiles(exportFolder);
      if (!result.success) {
        openBackupSetupPrompt(
          '检查备份目录',
          `当前默认导出文件夹不可用：${result.message}。请重新设置默认导出文件夹。`,
          { type: 'selectExportFolder' }
        );
        return;
      }

      if ((result.files || []).length === 0) {
        openBackupSetupPrompt(
          '还没有配置备份',
          '已设置默认导出文件夹，但目录中还没有备份文件。建议进入配置页导出一次备份。'
        );
      }
    } catch (error) {
      openBackupSetupPrompt(
        '检查备份设置',
        `读取备份目录失败：${error.message}。请检查默认导出文件夹设置。`,
        { type: 'selectExportFolder' }
      );
    }
  }, 300);
}

onMounted(() => {
  // 应用初始主题
  applyTheme();
  checkBackupSetupOnStartup();

  // 监听系统主题变化
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = (e) => {
    systemDarkMode.value = e.matches;
  };
  darkModeMediaQuery.addEventListener('change', handleThemeChange);

  window.ztools.onPluginEnter((action) => {
    // 模板: 将进入动作传递给主页，供自定义逻辑使用
    enterAction.value = action;
    checkBackupSetupOnStartup();
  });

  window.ztools.onPluginOut(() => {
    currentView.value = 'home';
  });
});


const handleMenuClick = (key) => {
  currentView.value = key;
};
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <nav class="app-nav" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          :class="['app-nav-item', { active: currentView === item.key }]"
          :aria-current="currentView === item.key ? 'page' : undefined"
          @click="handleMenuClick(item.key)"
        >
          <component :is="item.icon" class="app-nav-icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </header>

    <main class="app-content">
      <HomeView v-if="currentView === 'home'" :enterAction="enterAction" />
      <GroupView v-else-if="currentView === 'group'" />
      <ConfigView v-else-if="currentView === 'config'" :action="configAction"
        @action-handled="configAction = null" />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.app-header {
  position: relative;
  z-index: 10;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
}

.app-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.app-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 500;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.app-nav-item:hover {
  background: var(--ui-raised-surface-hover);
  color: var(--ui-text);
}

.app-nav-item.active {
  background: var(--ui-surface);
  color: var(--ui-primary);
  box-shadow: var(--ui-shadow-xs);
}

.app-nav-icon {
  font-size: 14px;
}

.app-content {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px;
  overflow: auto;
}
</style>
