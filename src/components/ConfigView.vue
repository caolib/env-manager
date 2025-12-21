<script setup>

import { computed, ref, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExportOutlined, ImportOutlined } from '@ant-design/icons-vue';
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore();

const systemVars = ref([]);
const userVars = ref([]);

const theme = computed({
    get: () => settingsStore.theme.value,
    set: (val) => { settingsStore.theme.value = val }
});

const sensitiveFieldsEnabled = computed({
    get: () => settingsStore.sensitiveFieldsEnabled.value,
    set: (val) => { settingsStore.sensitiveFieldsEnabled.value = val }
});

const sensitiveKeywords = computed({
    get: () => settingsStore.sensitiveKeywords.value,
    set: (val) => { settingsStore.sensitiveKeywords.value = val }
});

// 临时输入框
const newKeyword = ref('');

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

// 导出配置（包含环境变量和应用配置）
const exportConfig = () => {
    try {
        // 使用东八区时间
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const timestamp = beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `env-manager-${timestamp}.json`;

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
            message.success(`配置已导出到: ${result.path}`);
            // 自动打开文件所在位置
            window.services.revealInExplorer(result.path);
        } else {
            if (result.message !== '用户取消保存') {
                message.error(`导出失败: ${result.message}`);
            }
        }
    } catch (error) {
        message.error(`导出配置失败: ${error.message}`);
    }
}

// 导入配置（包含环境变量和应用配置）
const importConfig = () => {
    Modal.confirm({
        title: '确认导入',
        content: '导入配置将覆盖当前设置和环境变量，是否继续？',
        okText: '确定',
        cancelText: '取消',
        async onOk() {
            try {
                const result = window.services.importConfig();
                if (result.success) {
                    const config = result.data;

                    let imported = 0;
                    let failed = 0;

                    // 导入应用设置
                    if (config.settings) {
                        const s = config.settings;
                        if (s.theme !== undefined) settingsStore.setTheme(s.theme);
                    }

                    // 导入环境变量
                    if (config.env_vars) {
                        const envVars = config.env_vars;

                        // 导入系统变量
                        if (envVars.system_vars) {
                            for (const v of envVars.system_vars) {
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
                        if (envVars.user_vars) {
                            for (const v of envVars.user_vars) {
                                try {
                                    await window.services.setEnvVar(v.name, v.value, false);
                                    imported++;
                                } catch (error) {
                                    console.error(`导入用户变量 ${v.name} 失败:`, error);
                                    failed++;
                                }
                            }
                        }

                        await loadEnvVars();
                    }

                    message.success(`导入完成！${imported > 0 ? `环境变量: 成功 ${imported} 个${failed > 0 ? `，失败 ${failed} 个` : ''}` : '配置已导入'}`);
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

// 添加敏感关键词
const addSensitiveKeyword = () => {
    const keyword = newKeyword.value.trim().toLowerCase();
    if (!keyword) {
        message.warning('请输入关键词');
        return;
    }
    if (sensitiveKeywords.value.includes(keyword)) {
        message.warning('该关键词已存在');
        return;
    }
    sensitiveKeywords.value = [...sensitiveKeywords.value, keyword];
    newKeyword.value = '';
    message.success('关键词已添加');
};

// 删除敏感关键词
const removeSensitiveKeyword = (index) => {
    const keyword = sensitiveKeywords.value[index];
    sensitiveKeywords.value = sensitiveKeywords.value.filter((_, i) => i !== index);
    message.success(`已删除关键词: ${keyword}`);
};

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

        <div class="config-section">
            <h3>敏感字段保护</h3>
            <div class="config-row">
                <a-typography-text style="margin-right: 10px;">启用敏感字段隐藏:</a-typography-text>
                <a-switch v-model:checked="sensitiveFieldsEnabled" />
                <a-typography-text style="margin-left: 10px; font-size: 12px; color: var(--ant-color-text-secondary);">
                    当变量名包含配置的关键词时，隐藏值的大部分内容（显示前 1/2）
                </a-typography-text>
            </div>

            <div v-if="sensitiveFieldsEnabled" style="margin-top: 16px;">
                <a-typography-text style="display: block; margin-bottom: 8px;">敏感关键词列表:</a-typography-text>
                <div style="margin-bottom: 12px; display: flex; gap: 8px;">
                    <a-input v-model:value="newKeyword" placeholder="输入关键词（如：password、secret、token）" size="small"
                        @keydown.enter="addSensitiveKeyword" style="flex: 1; max-width: 300px;" />
                    <a-button type="primary" size="small" @click="addSensitiveKeyword">添加</a-button>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <a-tag v-for="(keyword, index) in sensitiveKeywords" :key="index" closable
                        @close="removeSensitiveKeyword(index)" color="blue">
                        {{ keyword }}
                    </a-tag>
                </div>
            </div>
        </div>

        <div class="config-section">
            <h3>数据备份</h3>
            <div class="config-row" style="gap: 10px; justify-content: flex-start;">
                <a-button type="primary" @click="exportConfig">
                    <ExportOutlined />
                    导出备份
                </a-button>
                <a-button type="default" @click="importConfig">
                    <ImportOutlined />
                    导入备份
                </a-button>
            </div>
            <div style="text-align: left; margin-top: 8px; color: var(--ant-color-text-secondary); font-size: 12px;">
                备份包含应用配置和所有环境变量
            </div>
        </div>
    </div>
</template>

<style scoped>
div.config-view {
    display: flex;
    justify-content: start;
    align-items: center;
    padding: 20px;
    flex-direction: column;
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
    align-items: flex-start;
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
