<script setup>

import { computed, ref, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExportOutlined, ImportOutlined, FolderOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore();

const systemVars = ref([]);
const userVars = ref([]);

const theme = computed({
    get: () => settingsStore.theme.value,
    set: (val) => { settingsStore.theme.value = val }
});

const exportPath = computed({
    get: () => settingsStore.exportPath.value,
    set: (val) => { settingsStore.exportPath.value = val }
});

const autoOpenFolder = computed({
    get: () => settingsStore.autoOpenFolder.value,
    set: (val) => { settingsStore.autoOpenFolder.value = val }
});

// 主题选项
const themeOptions = [
    { label: '跟随系统', value: 'system' },
    { label: '浅色主题', value: 'light' },
    { label: '深色主题', value: 'dark' }
];

// 加载环境变量
async function loadEnvVars() {
    try {
        const result = window.services.getEnvVars();
        systemVars.value = result.systemVars || [];
        userVars.value = result.userVars || [];
    } catch (error) {
        console.error('Error loading env vars:', error);
    }
}

// 选择导出路径
const selectExportPath = () => {
    try {
        const paths = window.utools.showOpenDialog({
            title: '选择默认导出路径',
            defaultPath: exportPath.value || window.utools.getPath('documents'),
            buttonLabel: '选择',
            properties: ['openDirectory']
        });

        if (paths && paths.length > 0) {
            exportPath.value = paths[0];
            message.success('导出路径已设置');
        }
    } catch (error) {
        message.error(`设置失败: ${error.message}`);
    }
};

// 重置为默认配置
const resetConfig = () => {
    settingsStore.resetToDefault();
    message.success('已重置为默认配置');
}

// 保存配置（显示提示，数据已自动持久化）
const saveData = () => {
    message.success("保存好了");
}

// 导出配置（仅导出 settings）
const exportConfig = () => {
    try {
        const configData = {
            version: '1.0.0',
            exportTime: new Date().toISOString(),
            settings: {
                theme: settingsStore.theme.value,
                exportPath: settingsStore.exportPath.value,
                autoOpenFolder: settingsStore.autoOpenFolder.value
            }
        };

        const result = window.services.exportConfig(configData, 'env-manager-config.json');
        if (result.success) {
            message.success(`配置已导出到: ${result.path}`);
        } else {
            if (result.message !== '用户取消保存') {
                message.error(`导出失败: ${result.message}`);
            }
        }
    } catch (error) {
        message.error(`导出配置失败: ${error.message}`);
    }
}

// 导入配置（仅导入 settings 部分）
const importConfig = () => {
    Modal.confirm({
        title: '确认导入',
        content: '导入配置将覆盖当前设置，是否继续？',
        okText: '确定',
        cancelText: '取消',
        onOk() {
            try {
                const result = window.services.importConfig();
                if (result.success) {
                    const config = result.data;
                    if (!config.settings) {
                        message.error('配置文件格式不正确');
                        return;
                    }

                    const s = config.settings;
                    if (s.theme !== undefined) settingsStore.setTheme(s.theme);
                    if (s.exportPath !== undefined) settingsStore.setExportPath(s.exportPath);
                    if (s.autoOpenFolder !== undefined) settingsStore.setAutoOpenFolder(s.autoOpenFolder);

                    message.success(`配置已从 ${result.path} 导入成功`);
                } else {
                    if (result.message !== '用户取消选择') {
                        message.error(`导入失败: ${result.message}`);
                    }
                }
            } catch (error) {
                message.error(`导入配置失败: ${error.message}`);
            }
        }
    });
};

// 导出环境变量
function exportEnvVars() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `环境变量备份_${timestamp}.json`;

        const data = {
            export_info: {
                export_time: new Date().toISOString(),
                version: '1.0.0'
            },
            system_vars: systemVars.value,
            user_vars: userVars.value
        };

        let result;
        const exportPathValue = settingsStore.exportPath.value;

        if (exportPathValue) {
            // 使用设置的路径
            const filePath = window.services.joinPath(exportPathValue, fileName);
            result = window.services.exportEnvVars(data, filePath);
        } else {
            // 使用默认路径（文档目录）
            result = window.services.exportEnvVarsWithDefaultPath(data, fileName);
        }

        if (result.success) {
            message.success(`环境变量已导出到: ${result.path}`);

            // 自动打开文件夹
            if (settingsStore.autoOpenFolder.value) {
                window.services.revealInExplorer(result.path);
            }
        }
    } catch (error) {
        message.error(`导出失败: ${error.message}`);
        console.error('Export error:', error);
    }
}

// 导入环境变量
function importEnvVars() {
    Modal.confirm({
        title: '确认导入',
        content: '导入配置会覆盖已存在的同名环境变量，是否继续？',
        okText: '确定',
        cancelText: '取消',
        onOk: async () => {
            try {
                const openPaths = window.utools.showOpenDialog({
                    title: '选择环境变量配置文件',
                    defaultPath: window.utools.getPath('documents'),
                    filters: [
                        { name: 'JSON文件', extensions: ['json'] },
                        { name: '所有文件', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });

                if (!openPaths || openPaths.length === 0) return;

                const result = window.services.importEnvVars(openPaths[0]);
                if (result.success) {
                    const data = result.data;

                    let imported = 0;
                    let failed = 0;

                    // 导入系统变量
                    if (data.system_vars) {
                        for (const v of data.system_vars) {
                            try {
                                await window.services.setEnvVar(v.name, v.value, true);
                                imported++;
                            } catch (error) {
                                console.error(`导入系统变量 ${v.name} 失败:`, error);
                                failed++;
                            }
                        }
                    }

                    // 导入用户变量
                    if (data.user_vars) {
                        for (const v of data.user_vars) {
                            try {
                                await window.services.setEnvVar(v.name, v.value, false);
                                imported++;
                            } catch (error) {
                                console.error(`导入用户变量 ${v.name} 失败:`, error);
                                failed++;
                            }
                        }
                    }

                    message.success(`导入完成！成功 ${imported} 个${failed > 0 ? `，失败 ${failed} 个` : ''}`);
                    await loadEnvVars();
                }
            } catch (error) {
                message.error(`导入失败: ${error.message}`);
                console.error('Import error:', error);
            }
        }
    });
}

onMounted(() => {
    loadEnvVars();
});


</script>

<template>
    <div class="config-view">
        <div class="config-section">
            <h3>外观设置</h3>
            <div class="config-row">
                <a-typography-text style="margin-right: 10px;">主题:</a-typography-text>
                <a-radio-group v-model:value="theme" button-style="solid">
                    <a-radio-button v-for="option in themeOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </a-radio-button>
                </a-radio-group>
            </div>
        </div>

        <a-divider />

        <div class="config-section">
            <h3>环境变量设置</h3>
            <div class="config-row">
                <a-typography-text style="margin-right: 10px;">默认导出路径:</a-typography-text>
                <div style="flex: 1; display: flex; gap: 8px;">
                    <a-input v-model:value="exportPath" placeholder="未设置，将使用文档目录" readonly style="flex: 1;">
                        <template #prefix>
                            <FolderOutlined />
                        </template>
                    </a-input>
                    <a-button type="primary" @click="selectExportPath">
                        选择路径
                    </a-button>
                </div>
            </div>

            <div class="config-row">
                <a-typography-text style="margin-right: 10px;">导出后自动打开文件夹:</a-typography-text>
                <a-switch v-model:checked="autoOpenFolder" />
            </div>
        </div>

        <a-divider />

        <div class="config-section">
            <h3>环境变量数据</h3>
            <div class="config-row" style="justify-content: center; gap: 10px;">
                <a-button type="default" @click="exportEnvVars">
                    <DownloadOutlined />
                    导出环境变量
                </a-button>
                <a-button type="default" @click="importEnvVars">
                    <UploadOutlined />
                    导入环境变量
                </a-button>
            </div>
        </div>

        <a-divider />

        <div class="config-section">
            <h3>应用配置</h3>
            <div class="config-row" style="gap: 10px; justify-content: center;">
                <a-button type="default" @click="exportConfig">
                    <ExportOutlined />
                    导出配置
                </a-button>
                <a-button type="default" @click="importConfig">
                    <ImportOutlined />
                    导入配置
                </a-button>
            </div>
        </div>

        <a-divider />

        <div class="config-row" style="justify-content: center;">
            <a-button type="primary" @click="saveData">保存</a-button>
            <a-popconfirm title="确定重置为默认配置吗？" ok-text="确定" cancel-text="取消" @confirm="resetConfig">
                <a-button danger>重置</a-button>
            </a-popconfirm>
        </div>
    </div>
</template>

<style scoped>
div.config-view {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 40px 20px;
    flex-direction: column;
    max-width: 800px;
    margin: 0 auto;
}

.config-section {
    width: 100%;
    margin-bottom: 20px;
}

.config-section h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
}

div.config-row {
    display: flex;
    align-items: center;
    padding: 12px 0;
    width: 100%;
    gap: 10px;
}

.forbidden-item {
    color: gray;
}

.type-icon {
    margin-right: 8px;
}
</style>
