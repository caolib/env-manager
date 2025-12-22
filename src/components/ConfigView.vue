<script setup>

import { computed, ref, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExportOutlined, ImportOutlined } from '@ant-design/icons-vue';
import { useSettingsStore } from '../stores/settings'
import { getData, setData } from '../utils/store'

const settingsStore = useSettingsStore();

// 普通变量备用值（与 HomeView 保持一致）
const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1';
const DISABLED_VARS_KEY = 'env-manager-disabled-vars-v1';

const systemVars = ref([]);
const userVars = ref([]);
const isAdmin = ref(false);

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

function checkAdminPrivileges() {
    try {
        isAdmin.value = !!window.services.checkAdminPrivileges();
    } catch (error) {
        console.error('检查管理员权限失败:', error);
        isAdmin.value = false;
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
            version: '1.2.0',
            exportTime: beijingTime.toISOString(),
            settings: {
                theme: settingsStore.theme.value,
                sensitiveFieldsEnabled: settingsStore.sensitiveFieldsEnabled.value,
                sensitiveKeywords: settingsStore.sensitiveKeywords.value
            },
            var_alternatives: getData(ALT_VALUES_KEY, { system: {}, user: {} }),
            disabled_vars: getData(DISABLED_VARS_KEY, { system: {}, user: {} }),
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
                // 导入前刷新一次权限状态（避免中途提权/降权造成误判）
                checkAdminPrivileges();

                const result = window.services.importConfig();
                if (result.success) {
                    const config = result.data;

                    let imported = 0;
                    let failed = 0;
                    let skipped = 0;

                    // 导入应用设置
                    if (config.settings) {
                        const s = config.settings;
                        if (s.theme !== undefined) settingsStore.setTheme(s.theme);
                        if (s.sensitiveFieldsEnabled !== undefined) settingsStore.setSensitiveFieldsEnabled(!!s.sensitiveFieldsEnabled);
                        if (s.sensitiveKeywords !== undefined && Array.isArray(s.sensitiveKeywords)) settingsStore.setSensitiveKeywords(s.sensitiveKeywords);
                    }

                    // 导入普通变量备用值
                    if (config.var_alternatives && typeof config.var_alternatives === 'object') {
                        const a = config.var_alternatives;
                        const safe = {
                            system: a.system && typeof a.system === 'object' ? a.system : {},
                            user: a.user && typeof a.user === 'object' ? a.user : {}
                        };
                        setData(ALT_VALUES_KEY, safe);
                    }

                    // 导入禁用变量
                    if (config.disabled_vars && typeof config.disabled_vars === 'object') {
                        const d = config.disabled_vars;
                        const safeDisabled = {
                            system: d.system && typeof d.system === 'object' ? d.system : {},
                            user: d.user && typeof d.user === 'object' ? d.user : {}
                        };
                        setData(DISABLED_VARS_KEY, safeDisabled);

                        // 确保禁用变量从注册表中删除
                        for (const [name, info] of Object.entries(safeDisabled.system)) {
                            if (isAdmin.value) {
                                try {
                                    await window.services.deleteEnvVar(name, true);
                                } catch (err) {
                                    // 忽略删除失败（可能已不存在）
                                }
                            }
                        }
                        for (const [name, info] of Object.entries(safeDisabled.user)) {
                            try {
                                await window.services.deleteEnvVar(name, false);
                            } catch (err) {
                                // 忽略删除失败（可能已不存在）
                            }
                        }
                    }

                    // 导入环境变量
                    if (config.env_vars) {
                        const envVars = config.env_vars;

                        const systemVarCount = Array.isArray(envVars.system_vars) ? envVars.system_vars.length : 0;
                        if (!isAdmin.value && systemVarCount > 0) {
                            message.warning('当前无管理员权限：系统环境变量修改将会失败，已跳过系统变量导入');
                        }

                        // 导入系统变量
                        if (envVars.system_vars) {
                            if (isAdmin.value) {
                                for (const v of envVars.system_vars) {
                                    try {
                                        await window.services.setEnvVar(v.name, v.value, true);
                                        imported++;
                                    } catch (error) {
                                        console.error(`导入系统变量 ${v.name} 失败:`, error);
                                        failed++;
                                    }
                                }
                            } else {
                                skipped += Array.isArray(envVars.system_vars) ? envVars.system_vars.length : 0;
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

                    message.success(`导入完成！${imported > 0 || failed > 0 || skipped > 0 ? `环境变量: 成功 ${imported} 个${failed > 0 ? `，失败 ${failed} 个` : ''}${skipped > 0 ? `，跳过 ${skipped} 个(系统变量)` : ''}` : '配置已导入'}`);
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
    checkAdminPrivileges();
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
                    当变量名包含配置的关键词时，隐藏值一半内容
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
