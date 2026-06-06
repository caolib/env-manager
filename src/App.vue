<script setup>
import { onMounted, ref, watch, computed, provide } from 'vue';
import { message } from './ui';
import HomeView from './components/HomeView.vue';
import ConfigView from './components/ConfigView.vue';
import GroupView from './components/GroupView.vue';
import { useSettingsStore } from './stores/settings';
import { useGroupsStore } from './stores/groups';
import { getData } from './utils/store';

const currentView = ref('home');
const enterAction = ref({});
const settingsStore = useSettingsStore();
const groupsStore = useGroupsStore();

const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1';
const DISABLED_VARS_KEY = 'env-manager-disabled-vars-v1';

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

const navItems = [
  {
    key: 'home',
    label: '主页',
  },
  {
    key: 'group',
    label: '变量组',
  },
  {
    key: 'config',
    label: '配置',
  },
];

// Note: 功能命令需要在具体插件模板中自行注册，模板保留主题与配置逻辑

function getBeijingTimestamp() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return {
    date: beijingTime,
    filePart: beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  };
}

function buildStartupExportConfig(beijingTime) {
  const envResult = window.services.getEnvVars();

  return {
    version: '1.2.0',
    exportTime: beijingTime.toISOString(),
    settings: {
      theme: settingsStore.theme.value,
      sensitiveFieldsEnabled: settingsStore.sensitiveFieldsEnabled.value,
      sensitiveKeywords: settingsStore.sensitiveKeywords.value,
      defaultExportFolder: settingsStore.defaultExportFolder.value,
      startupExportEnabled: settingsStore.startupExportEnabled.value,
      startupExportMaxFiles: settingsStore.startupExportMaxFiles.value
    },
    var_alternatives: getData(ALT_VALUES_KEY, { system: {}, user: {} }),
    disabled_vars: getData(DISABLED_VARS_KEY, { system: {}, user: {} }),
    groups: JSON.parse(JSON.stringify(groupsStore.groups.value)),
    env_vars: {
      system_vars: envResult.systemVars || [],
      user_vars: envResult.userVars || []
    }
  };
}

function exportConfigOnStartup() {
  if (!settingsStore.startupExportEnabled.value) return;

  const exportFolder = settingsStore.defaultExportFolder.value?.trim();
  if (!exportFolder) {
    message.warning('启动自动导出已开启，请先设置默认导出文件夹');
    return;
  }

  try {
    const { date, filePart } = getBeijingTimestamp();
    const fileName = `env-manager-startup-${filePart}.json`;
    const configData = buildStartupExportConfig(date);
    const result = window.services.exportStartupConfig(
      configData,
      fileName,
      exportFolder,
      settingsStore.startupExportMaxFiles.value
    );

    if (!result.success) {
      message.error(`启动自动导出失败: ${result.message}`);
    }
  } catch (error) {
    message.error(`启动自动导出失败: ${error.message}`);
  }
}

onMounted(() => {
  // 应用初始主题
  applyTheme();
  exportConfigOnStartup();

  // 监听系统主题变化
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = (e) => {
    systemDarkMode.value = e.matches;
  };
  darkModeMediaQuery.addEventListener('change', handleThemeChange);

  window.utools.onPluginEnter((action) => {
    // 模板: 将进入动作传递给主页，供自定义逻辑使用
    enterAction.value = action;
  });

  window.utools.onPluginOut(() => {
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
          @click="handleMenuClick(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>

    <main class="app-content">
      <HomeView v-if="currentView === 'home'" :enterAction="enterAction" />
      <GroupView v-else-if="currentView === 'group'" />
      <ConfigView v-else-if="currentView === 'config'" />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: transparent;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--bg-color);
}

.app-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-nav-item {
  min-height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.app-nav-item:hover,
.app-nav-item.active {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.app-content {
  padding: 16px;
}
</style>
