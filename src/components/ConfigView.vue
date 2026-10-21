<script setup>

import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { message, Modal } from '../ui'
import {
    CalendarOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    ExportOutlined,
    EyeOutlined,
    FolderOpenOutlined,
    ImportOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined
} from '@ant-design/icons-vue';
import { useSettingsStore } from '../stores/settings'
import { useGroupsStore } from '../stores/groups'
import { useAlternativesStore } from '../stores/alternatives'
import { getData, setData } from '../utils/store'
import ImportDiffModal from './ImportDiffModal.vue';
import EnvConfigDiffModal from './EnvConfigDiffModal.vue';

const props = defineProps({
    action: {
        type: Object,
        default: null
    }
});

const emit = defineEmits(['action-handled']);

const settingsStore = useSettingsStore();
const groupsStore = useGroupsStore();
const alternativesStore = useAlternativesStore();

const showImportArea = ref(false);
const showDiffModal = ref(false);
const currentConfig = ref({});
const pendingImportConfig = ref({});
const backupFiles = ref([]);
const backupFilesLoading = ref(false);
const cleanupBackupFilesLoading = ref(false);
const selectedBackupConfig = ref({});
const selectedBackupFile = ref({});
const showBackupDiffModal = ref(false);
const backupTimeDisplayMode = ref('relative');
const relativeTimeNow = ref(Date.now());
let backupFilesLoadTimer = null;
let relativeTimeTimer = null;

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

const defaultExportFolder = computed({
    get: () => settingsStore.defaultExportFolder.value,
    set: (val) => { settingsStore.defaultExportFolder.value = val }
});

const backupMaxFiles = computed({
    get: () => settingsStore.backupMaxFiles.value,
    set: (val) => { settingsStore.setBackupMaxFiles(val) }
});

const isRelativeBackupTime = computed(() => backupTimeDisplayMode.value === 'relative');

// 临时输入框
const newKeyword = ref('');

// 主题选项
const themeOptions = [
    { label: '跟随系统', value: 'system' },
    { label: '浅色主题', value: 'light' },
    { label: '深色主题', value: 'dark' }
];

const backupFileColumns = [
    { title: 'ID', key: 'id', width: 70, sorter: compareNumberField('id') },
    { title: '导出时间', key: 'exportTime', width: 170, sorter: (a, b) => getSortableTime(a) - getSortableTime(b) },
    { title: '系统变量数', key: 'systemVarCount', width: 110, sorter: compareNumberField('systemVarCount') },
    { title: '用户变量数', key: 'userVarCount', width: 110, sorter: compareNumberField('userVarCount') },
    { title: '系统 Path 数', key: 'systemPathItemCount', width: 110, sorter: compareNumberField('systemPathItemCount') },
    { title: '用户 Path 数', key: 'userPathItemCount', width: 110, sorter: compareNumberField('userPathItemCount') },
    { title: '操作', key: 'actions', width: 180 }
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

// 获取当前配置对象
const getCurrentConfig = () => {
    return {
        version: '1.2.0',
        settings: {
            theme: settingsStore.theme.value,
            sensitiveFieldsEnabled: settingsStore.sensitiveFieldsEnabled.value,
            sensitiveKeywords: settingsStore.sensitiveKeywords.value,
            defaultExportFolder: settingsStore.defaultExportFolder.value,
            backupMaxFiles: settingsStore.backupMaxFiles.value
        },
        var_alternatives: getData(ALT_VALUES_KEY, { system: {}, user: {} }),
        disabled_vars: getData(DISABLED_VARS_KEY, { system: {}, user: {} }),
        groups: JSON.parse(JSON.stringify(groupsStore.groups.value)),
        env_vars: {
            system_vars: systemVars.value,
            user_vars: userVars.value
        }
    };
};

// 导出配置（包含环境变量和应用配置）
const exportConfig = async () => {
    try {
        await loadEnvVars();

        // 使用东八区时间
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const timestamp = beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `env-manager-${timestamp}.json`;

        const configData = {
            ...getCurrentConfig(),
            exportTime: beijingTime.toISOString()
        };

        const exportFolder = settingsStore.defaultExportFolder.value?.trim();
        const result = window.services.exportConfig(
            configData,
            fileName,
            exportFolder,
            settingsStore.backupMaxFiles.value
        );
        if (result.success) {
            message.success(`配置已导出到: ${result.path}`);
            loadBackupFiles();
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

// 处理导入逻辑
const processImport = async (config) => {
    try {
        // 导入前刷新一次权限状态（避免中途提权/降权造成误判）
        checkAdminPrivileges();

        let imported = 0;
        let failed = 0;
        let importedAltsCount = 0;
        let importedGroupsCount = 0;

        // 导入应用设置
        if (config.settings) {
            const s = config.settings;
            if (s.theme !== undefined) settingsStore.setTheme(s.theme);
            if (s.sensitiveFieldsEnabled !== undefined) settingsStore.setSensitiveFieldsEnabled(!!s.sensitiveFieldsEnabled);
            if (s.sensitiveKeywords !== undefined && Array.isArray(s.sensitiveKeywords)) settingsStore.setSensitiveKeywords(s.sensitiveKeywords);
            if (s.defaultExportFolder !== undefined) settingsStore.setDefaultExportFolder(s.defaultExportFolder);
            if (s.backupMaxFiles !== undefined) settingsStore.setBackupMaxFiles(s.backupMaxFiles);
            if (s.startupExportMaxFiles !== undefined) settingsStore.setBackupMaxFiles(s.startupExportMaxFiles);
        }

        // 导入普通变量备用值
        if (config.var_alternatives && typeof config.var_alternatives === 'object') {
            const a = config.var_alternatives;
            const safe = {
                system: a.system && typeof a.system === 'object' ? a.system : {},
                user: a.user && typeof a.user === 'object' ? a.user : {}
            };

            // 计算导入的备用值数量
            let totalAlts = 0;
            Object.keys(safe.system || {}).forEach(key => {
                if (Array.isArray(safe.system[key])) totalAlts += safe.system[key].length;
            });
            Object.keys(safe.user || {}).forEach(key => {
                if (Array.isArray(safe.user[key])) totalAlts += safe.user[key].length;
            });

            console.log('准备导入备用值:', safe, '总数:', totalAlts);

            // 深度克隆为纯对象，去除 Proxy 等不可序列化对象
            const pureData = JSON.parse(JSON.stringify(safe));
            setData(ALT_VALUES_KEY, pureData);

            // 验证保存是否成功
            const savedData = getData(ALT_VALUES_KEY);
            console.log('保存后的备用值:', savedData);

            // 重新加载 alternatives store 以应用新数据
            alternativesStore.reloadAlternatives();

            // 验证 store 是否更新
            console.log('Store 更新后的备用值:', alternativesStore.alternatives.value);

            importedAltsCount = totalAlts;
        }

        // 导入禁用变量
        if (config.disabled_vars && typeof config.disabled_vars === 'object') {
            const d = config.disabled_vars;
            const safeDisabled = {
                system: d.system && typeof d.system === 'object' ? d.system : {},
                user: d.user && typeof d.user === 'object' ? d.user : {}
            };

            // 深度克隆为纯对象
            const pureDisabledData = JSON.parse(JSON.stringify(safeDisabled));
            setData(DISABLED_VARS_KEY, pureDisabledData);

            // 确保禁用变量从注册表中删除（系统变量一次 UAC 提权批量删除）
            const systemDisabledNames = Object.keys(safeDisabled.system);
            if (systemDisabledNames.length > 0) {
                try {
                    await window.services.deleteEnvVarsBatch(systemDisabledNames, true);
                } catch (error) {
                    console.error('删除系统禁用变量失败:', error);
                }
            }
            const userDisabledNames = Object.keys(safeDisabled.user);
            if (userDisabledNames.length > 0) {
                try {
                    await window.services.deleteEnvVarsBatch(userDisabledNames, false);
                } catch (error) {
                    console.error('删除用户禁用变量失败:', error);
                }
            }
        }

        // 导入变量组
        if (config.groups && Array.isArray(config.groups)) {
            groupsStore.importGroups(config.groups);
            importedGroupsCount = config.groups.length;
        }

        // 导入环境变量
        if (config.env_vars) {
            const envVars = config.env_vars;

            // 系统变量：无管理员权限时由 preload 通过一次 UAC 提权写入
            const systemVars = Array.isArray(envVars.system_vars) ? envVars.system_vars : [];
            if (systemVars.length > 0) {
                try {
                    await window.services.setEnvVarsBatch(
                        systemVars.map(v => ({ name: v.name, value: v.value })),
                        true
                    );
                    imported += systemVars.length;
                } catch (error) {
                    console.error('导入系统变量失败:', error);
                    failed += systemVars.length;
                }
            }

            // 导入用户变量
            const userVars = Array.isArray(envVars.user_vars) ? envVars.user_vars : [];
            if (userVars.length > 0) {
                try {
                    await window.services.setEnvVarsBatch(
                        userVars.map(v => ({ name: v.name, value: v.value })),
                        false
                    );
                    imported += userVars.length;
                } catch (error) {
                    console.error('导入用户变量失败:', error);
                    failed += userVars.length;
                }
            }

            await loadEnvVars();
        }

        // 构建导入结果消息
        const messages = [];
        if (imported > 0 || failed > 0) {
            messages.push(`环境变量: 成功 ${imported} 个${failed > 0 ? `，失败 ${failed} 个` : ''}`);
        }
        if (importedAltsCount > 0) {
            messages.push(`备用值: ${importedAltsCount} 个`);
        }
        if (importedGroupsCount > 0) {
            messages.push(`变量组: ${importedGroupsCount} 个`);
        }

        const resultMsg = messages.length > 0 ? `导入完成！${messages.join('，')}` : '配置已导入';
        message.success(resultMsg, 5); // 显示5秒
        showImportArea.value = false;
        loadBackupFiles();
    } catch (error) {
        message.error(`导入配置失败: ${error.message}`);
    }
};

function cloneData(value, fallback) {
    try {
        return JSON.parse(JSON.stringify(value ?? fallback));
    } catch {
        return fallback;
    }
}

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function isEmptyConfigValue(value) {
    return value === undefined
        || value === null
        || value === ''
        || (Array.isArray(value) && value.length === 0);
}

function countAlternativeItems(root) {
    return ['system', 'user'].reduce((total, scope) => {
        const scoped = root?.[scope] || {};
        return total + Object.values(scoped).reduce((scopeTotal, list) => {
            return scopeTotal + (Array.isArray(list) ? list.length : 0);
        }, 0);
    }, 0);
}

function normalizeScopedObject(root) {
    return {
        system: root?.system && typeof root.system === 'object' ? root.system : {},
        user: root?.user && typeof root.user === 'object' ? root.user : {}
    };
}

function mergeMissingScopedEntries(currentRoot, importRoot) {
    const merged = normalizeScopedObject(cloneData(currentRoot, { system: {}, user: {} }));
    const incoming = normalizeScopedObject(importRoot);
    const addedEntries = [];

    ['system', 'user'].forEach(scope => {
        Object.entries(incoming[scope]).forEach(([name, value]) => {
            if (hasOwn(merged[scope], name)) return;
            merged[scope][name] = cloneData(value, value);
            addedEntries.push({ scope, name, value });
        });
    });

    return { merged, addedEntries };
}

function splitPathValue(value) {
    return String(value ?? '')
        .split(';')
        .map(item => item.trim())
        .filter(Boolean);
}

function mergePathValue(currentValue, importValue) {
    const mergedPaths = [];
    const seen = new Set();
    let addedCount = 0;

    splitPathValue(currentValue).forEach(path => {
        if (seen.has(path)) return;
        seen.add(path);
        mergedPaths.push(path);
    });

    splitPathValue(importValue).forEach(path => {
        if (seen.has(path)) return;
        seen.add(path);
        mergedPaths.push(path);
        addedCount++;
    });

    return {
        value: mergedPaths.join(';'),
        addedCount
    };
}

function isPathVariableName(name) {
    return String(name || '').toLowerCase() === 'path';
}

function normalizeEnvVars(vars) {
    return Array.isArray(vars)
        ? vars.filter(item => item && item.name).map(item => ({
            name: String(item.name),
            value: String(item.value ?? '')
        }))
        : [];
}

function envVarMapByName(vars) {
    return new Map(normalizeEnvVars(vars).map(item => [item.name.toLowerCase(), item]));
}

function importSettingIfEmpty(key, incomingValue) {
    if (incomingValue === undefined) return false;

    const setters = {
        theme: () => {
            if (!isEmptyConfigValue(settingsStore.theme.value)) return false;
            settingsStore.setTheme(incomingValue);
            return true;
        },
        sensitiveFieldsEnabled: () => {
            if (settingsStore.sensitiveFieldsEnabled.value !== undefined) return false;
            settingsStore.setSensitiveFieldsEnabled(!!incomingValue);
            return true;
        },
        sensitiveKeywords: () => {
            if (!Array.isArray(incomingValue)) return false;
            const current = Array.isArray(settingsStore.sensitiveKeywords.value)
                ? settingsStore.sensitiveKeywords.value
                : [];
            const merged = [...current];
            incomingValue.forEach(keyword => {
                if (!merged.includes(keyword)) merged.push(keyword);
            });
            if (merged.length === current.length) return false;
            settingsStore.setSensitiveKeywords(merged);
            return true;
        },
        defaultExportFolder: () => {
            if (!isEmptyConfigValue(settingsStore.defaultExportFolder.value)) return false;
            settingsStore.setDefaultExportFolder(incomingValue);
            return true;
        },
        backupMaxFiles: () => {
            if (!isEmptyConfigValue(settingsStore.backupMaxFiles.value)) return false;
            settingsStore.setBackupMaxFiles(incomingValue);
            return true;
        }
    };

    return setters[key]?.() || false;
}

async function importEnvVarsIncrementally(envVars) {
    const result = {
        added: 0,
        mergedPathVars: 0,
        mergedPathItems: 0,
        skippedExisting: 0,
        failed: 0
    };

    const importSystemVars = normalizeEnvVars(envVars?.system_vars);
    const importUserVars = normalizeEnvVars(envVars?.user_vars);
    const currentSystemMap = envVarMapByName(systemVars.value);
    const currentUserMap = envVarMapByName(userVars.value);

    // 先收集本作用域需要写入的变更，再一次性提交；
    // 系统变量由 preload 在一次 UAC 提权中批量写入，不再因为无管理员权限而跳过。
    async function importScope(vars, currentMap, isSystem) {
        const updates = [];

        for (const item of vars) {
            const key = item.name.toLowerCase();
            const currentItem = currentMap.get(key);

            if (!currentItem) {
                updates.push({ key, name: item.name, value: item.value });
                continue;
            }

            if (!isPathVariableName(item.name)) {
                result.skippedExisting++;
                continue;
            }

            const mergedPath = mergePathValue(currentItem.value, item.value);
            if (mergedPath.value === currentItem.value) {
                result.skippedExisting++;
                continue;
            }

            updates.push({
                key,
                name: currentItem.name,
                value: mergedPath.value,
                merged: true,
                addedCount: mergedPath.addedCount
            });
        }

        if (updates.length === 0) return;

        try {
            await window.services.setEnvVarsBatch(
                updates.map(item => ({ name: item.name, value: item.value })),
                isSystem
            );
            updates.forEach(item => {
                currentMap.set(item.key, { name: item.name, value: item.value });
                if (item.merged) {
                    result.mergedPathVars++;
                    result.mergedPathItems += item.addedCount;
                } else {
                    result.added++;
                }
            });
        } catch (error) {
            console.error('增量导入环境变量失败:', error);
            result.failed += updates.length;
        }
    }

    await importScope(importSystemVars, currentSystemMap, true);
    await importScope(importUserVars, currentUserMap, false);

    return result;
}

// 增量导入：只添加当前不存在的配置；Path 变量按路径项合并去重。
const processIncrementalImport = async (config) => {
    try {
        checkAdminPrivileges();
        await loadEnvVars();

        let importedSettingsCount = 0;
        let importedAltsCount = 0;
        let importedDisabledCount = 0;
        let importedGroupsCount = 0;
        let deletedDisabledEnvCount = 0;

        if (config.settings && typeof config.settings === 'object') {
            Object.entries(config.settings).forEach(([key, value]) => {
                if (importSettingIfEmpty(key, value)) importedSettingsCount++;
            });
        }

        if (config.var_alternatives && typeof config.var_alternatives === 'object') {
            const currentAlts = getData(ALT_VALUES_KEY, { system: {}, user: {} });
            const { merged, addedEntries } = mergeMissingScopedEntries(currentAlts, config.var_alternatives);

            if (addedEntries.length > 0) {
                setData(ALT_VALUES_KEY, cloneData(merged, { system: {}, user: {} }));
                alternativesStore.reloadAlternatives();
                importedAltsCount = countAlternativeItems({
                    system: Object.fromEntries(addedEntries.filter(item => item.scope === 'system').map(item => [item.name, item.value])),
                    user: Object.fromEntries(addedEntries.filter(item => item.scope === 'user').map(item => [item.name, item.value]))
                });
            }
        }

        if (config.disabled_vars && typeof config.disabled_vars === 'object') {
            const currentDisabled = getData(DISABLED_VARS_KEY, { system: {}, user: {} });
            const { merged, addedEntries } = mergeMissingScopedEntries(currentDisabled, config.disabled_vars);

            if (addedEntries.length > 0) {
                setData(DISABLED_VARS_KEY, cloneData(merged, { system: {}, user: {} }));
                importedDisabledCount = addedEntries.length;

                const systemDisabledToDelete = [];
                const userDisabledToDelete = [];
                for (const item of addedEntries) {
                    if (item.scope === 'system') {
                        systemDisabledToDelete.push(item.name);
                    } else {
                        userDisabledToDelete.push(item.name);
                    }
                }

                for (const [names, isSystem] of [[systemDisabledToDelete, true], [userDisabledToDelete, false]]) {
                    if (names.length === 0) continue;
                    try {
                        await window.services.deleteEnvVarsBatch(names, isSystem);
                        deletedDisabledEnvCount += names.length;
                    } catch {
                        // 忽略删除失败（可能已不存在）
                    }
                }
            }
        }

        if (config.groups && Array.isArray(config.groups)) {
            const existingGroupKeys = new Set(groupsStore.groups.value.map(group => {
                return `${group.scope || 'user'}:${group.name}`.toLowerCase();
            }));

            config.groups.forEach(group => {
                if (!group?.name) return;
                const key = `${group.scope || 'user'}:${group.name}`.toLowerCase();
                if (existingGroupKeys.has(key)) return;

                groupsStore.addGroup(cloneData(group, group));
                existingGroupKeys.add(key);
                importedGroupsCount++;
            });
        }

        const envResult = config.env_vars
            ? await importEnvVarsIncrementally(config.env_vars)
            : { added: 0, mergedPathVars: 0, mergedPathItems: 0, skippedExisting: 0, failed: 0 };

        await loadEnvVars();

        const messages = [];
        if (envResult.added > 0 || envResult.mergedPathVars > 0 || envResult.failed > 0) {
            messages.push(
                `环境变量: 新增 ${envResult.added} 个`
                + `${envResult.mergedPathVars > 0 ? `，合并 Path ${envResult.mergedPathVars} 个(${envResult.mergedPathItems} 项)` : ''}`
                + `${envResult.failed > 0 ? `，失败 ${envResult.failed} 个` : ''}`
            );
        }
        if (importedSettingsCount > 0) messages.push(`应用设置: ${importedSettingsCount} 项`);
        if (importedAltsCount > 0) messages.push(`备用值: ${importedAltsCount} 个`);
        if (importedDisabledCount > 0) {
            messages.push(`禁用变量: ${importedDisabledCount} 个${deletedDisabledEnvCount > 0 ? `，已删除环境变量 ${deletedDisabledEnvCount} 个` : ''}`);
        }
        if (importedGroupsCount > 0) messages.push(`变量组: ${importedGroupsCount} 个`);

        const resultMsg = messages.length > 0 ? `增量导入完成！${messages.join('，')}` : '没有需要增量导入的配置';
        message.success(resultMsg, 5);
        showImportArea.value = false;
        loadBackupFiles();
    } catch (error) {
        message.error(`增量导入配置失败: ${error.message}`);
    }
};

// 拖拽导入处理
const handleBeforeUpload = (file) => {
    // eslint-disable-next-line no-undef
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const config = JSON.parse(e.target.result);
            currentConfig.value = getCurrentConfig();
            pendingImportConfig.value = config;
            showDiffModal.value = true;
        } catch {
            message.error('解析配置文件失败，请确保是有效的 JSON 格式');
        }
    };
    reader.readAsText(file);
    return false; // 阻止自动上传
};

const handleDiffConfirm = async (mode = 'overwrite') => {
    if (mode === 'incremental') {
        await processIncrementalImport(pendingImportConfig.value);
        return;
    }

    await processImport(pendingImportConfig.value);
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

function promptExportBackupAfterFolderSelected() {
    Modal.confirm({
        title: '导出一次备份配置',
        content: '默认导出文件夹已设置。是否现在导出一次备份配置？',
        okText: '立即导出',
        cancelText: '稍后',
        onOk: () => exportConfig()
    });
}

const selectDefaultExportFolder = () => {
    try {
        const result = window.services.selectExportFolder(defaultExportFolder.value?.trim());
        if (result.success) {
            defaultExportFolder.value = result.path;
            loadBackupFiles();
            message.success('默认导出文件夹已设置');
            promptExportBackupAfterFolderSelected();
        } else if (result.message !== '用户取消选择') {
            message.error(`选择文件夹失败: ${result.message}`);
        }
    } catch (error) {
        message.error(`选择文件夹失败: ${error.message}`);
    }
};

watch(() => props.action?.id, () => {
    if (props.action?.type !== 'selectExportFolder') return;

    window.setTimeout(() => {
        selectDefaultExportFolder();
        emit('action-handled');
    }, 0);
}, { immediate: true });

const openDefaultExportFolder = () => {
    const folder = defaultExportFolder.value?.trim();
    if (!folder) {
        message.warning('请先设置默认导出文件夹');
        return;
    }

    try {
        window.services.openFolder(folder);
    } catch (error) {
        message.error(`打开文件夹失败: ${error.message}`);
    }
};

const clearDefaultExportFolder = () => {
    defaultExportFolder.value = '';
    backupFiles.value = [];
    message.success('已清空默认导出文件夹');
};

const formatFileTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
};

function formatRelativeTime(timeMs) {
    if (!timeMs) return '-';

    const diffMs = relativeTimeNow.value - timeMs;
    if (diffMs < -60000) return '刚刚';
    const seconds = Math.max(0, Math.floor(diffMs / 1000));
    if (seconds < 60) return '刚刚';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} 个月前`;

    const years = Math.floor(months / 12);
    return `${years} 年前`;
}

function formatBackupFileTime(record) {
    if (!isRelativeBackupTime.value) {
        return formatFileTime(record?.exportTime);
    }

    return formatRelativeTime(getSortableTime(record));
}

function toggleBackupTimeDisplayMode() {
    backupTimeDisplayMode.value = isRelativeBackupTime.value ? 'absolute' : 'relative';
    relativeTimeNow.value = Date.now();
}

function compareNumberField(field) {
    return (a, b) => (Number(a?.[field]) || 0) - (Number(b?.[field]) || 0);
}

function getSortableTime(record) {
    if (typeof record?.mtimeMs === 'number') return record.mtimeMs;
    const date = new Date(record?.exportTime || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortObjectKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortObjectKeys);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = sortObjectKeys(value[key]);
            return result;
        }, {});
    }

    return value;
}

function normalizeConfigForCompare(config) {
    const clone = JSON.parse(JSON.stringify(config || {}));
    if (clone && typeof clone === 'object' && !Array.isArray(clone)) {
        delete clone.exportTime;
    }
    return sortObjectKeys(clone);
}

function isSameConfig(left, right) {
    return JSON.stringify(normalizeConfigForCompare(left)) === JSON.stringify(normalizeConfigForCompare(right));
}

function hasBackupConfigDiff(config) {
    return !isSameConfig(getCurrentConfig(), config);
}

const loadBackupFiles = async () => {
    const folder = defaultExportFolder.value?.trim();
    if (!folder) {
        backupFiles.value = [];
        return;
    }

    backupFilesLoading.value = true;
    try {
        await loadEnvVars();
        const result = window.services.listExportConfigFiles(folder);
        if (result.success) {
            backupFiles.value = (result.files || []).map((file, index) => ({
                ...file,
                id: index + 1,
                hasConfigDiff: hasBackupFileConfigDiff(file, folder)
            }));
        } else {
            backupFiles.value = [];
            message.error(`读取配置文件列表失败: ${result.message}`);
        }
    } catch (error) {
        backupFiles.value = [];
        message.error(`读取配置文件列表失败: ${error.message}`);
    } finally {
        backupFilesLoading.value = false;
    }
};

function hasBackupFileConfigDiff(file, folder) {
    const result = window.services.readExportConfigFile(file.path, folder);
    if (!result.success) return true;
    return hasBackupConfigDiff(result.data);
}

const getBackupFileRowProps = (record) => {
    if (!record.hasConfigDiff) return {};

    return {
        class: 'backup-file-row-clickable',
        onClick: () => showBackupConfigDiff(record)
    };
};

const showBackupConfigDiff = async (record) => {
    const folder = defaultExportFolder.value?.trim();
    if (!folder) {
        message.warning('请先设置默认导出文件夹');
        return;
    }

    try {
        const result = window.services.readExportConfigFile(record.path, folder);
        if (!result.success) {
            message.error(`读取配置文件失败: ${result.message}`);
            return;
        }

        await loadEnvVars();
        currentConfig.value = getCurrentConfig();
        selectedBackupConfig.value = result.data;
        selectedBackupFile.value = record;
        showBackupDiffModal.value = true;
    } catch (error) {
        message.error(`读取配置文件失败: ${error.message}`);
    }
};

const cleanupDuplicateBackupFiles = async () => {
    const folder = defaultExportFolder.value?.trim();
    if (!folder) {
        message.warning('请先设置默认导出文件夹');
        return;
    }

    cleanupBackupFilesLoading.value = true;
    try {
        await loadEnvVars();
        const result = window.services.cleanupDuplicateConfigFiles(folder, getCurrentConfig());
        if (!result.success) {
            message.error(`清理重复备份失败: ${result.message}`);
            return;
        }

        if (result.removedCount > 0) {
            const currentText = result.currentMatchRemovedCount > 0
                ? `，其中 ${result.currentMatchRemovedCount} 个与当前配置相同`
                : '';
            message.success(`清理完成：已将 ${result.removedCount} 个重复备份移入回收站${currentText}`);
        } else {
            message.info('没有需要清理的重复备份');
        }
        await loadBackupFiles();
    } catch (error) {
        message.error(`清理重复备份失败: ${error.message}`);
    } finally {
        cleanupBackupFilesLoading.value = false;
    }
};

const importBackupFile = async (record) => {
    const folder = defaultExportFolder.value?.trim();
    if (!folder) {
        message.warning('请先设置默认导出文件夹');
        return;
    }

    try {
        const result = window.services.readExportConfigFile(record.path, folder);
        if (!result.success) {
            message.error(`读取配置文件失败: ${result.message}`);
            return;
        }

        await loadEnvVars();
        currentConfig.value = getCurrentConfig();
        pendingImportConfig.value = result.data;
        showDiffModal.value = true;
    } catch (error) {
        message.error(`读取配置文件失败: ${error.message}`);
    }
};

watch(defaultExportFolder, (folder) => {
    if (backupFilesLoadTimer) {
        window.clearTimeout(backupFilesLoadTimer);
    }

    if (!folder?.trim()) {
        backupFiles.value = [];
        return;
    }

    backupFilesLoadTimer = window.setTimeout(() => {
        loadBackupFiles();
    }, 300);
});

onMounted(() => {
    checkAdminPrivileges();
    loadEnvVars();
    loadBackupFiles();
    relativeTimeTimer = window.setInterval(() => {
        relativeTimeNow.value = Date.now();
    }, 60000);
});

onBeforeUnmount(() => {
    if (backupFilesLoadTimer) {
        window.clearTimeout(backupFilesLoadTimer);
    }
    if (relativeTimeTimer) {
        window.clearInterval(relativeTimeTimer);
    }
});


</script>

<template>
    <div :class="['config-view', { 'diff-mode': showBackupDiffModal }]">
        <EnvConfigDiffModal v-if="showBackupDiffModal" v-model:open="showBackupDiffModal"
            :currentConfig="currentConfig" :compareConfig="selectedBackupConfig" :compareFile="selectedBackupFile" />

        <template v-else>
        <section class="config-category compact">
            <div class="category-heading">
                <h3>界面</h3>
            </div>
            <div class="category-content">
                <div class="setting-row">
                    <a-typography-text class="setting-label">主题</a-typography-text>
                    <div class="setting-control">
                        <a-radio-group v-model:value="theme" button-style="solid" class="theme-radio-group">
                            <a-radio-button v-for="option in themeOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </a-radio-button>
                        </a-radio-group>
                    </div>
                </div>
            </div>
        </section>

        <section class="config-category compact">
            <div class="category-heading">
                <h3>敏感字段</h3>
            </div>
            <div class="category-content">
                <div class="setting-row inline">
                    <a-typography-text class="setting-label">隐藏敏感字段</a-typography-text>
                    <div class="setting-control">
                        <a-switch v-model:checked="sensitiveFieldsEnabled" />
                        <span class="setting-note">变量名包含关键词时隐藏部分值</span>
                    </div>
                </div>

                <div v-if="sensitiveFieldsEnabled" class="setting-row align-start no-label">
                    <div class="keyword-control">
                        <div class="keyword-input-row">
                            <a-input v-model:value="newKeyword" placeholder="输入关键词（如：password、secret、token）"
                                size="small" @keydown.enter="addSensitiveKeyword" class="keyword-input" />
                            <a-button type="primary" size="small" @click="addSensitiveKeyword">
                                <PlusOutlined />
                                添加
                            </a-button>
                        </div>
                        <div class="keyword-tags">
                            <a-tag v-for="(keyword, index) in sensitiveKeywords" :key="index" closable
                                @close="removeSensitiveKeyword(index)" color="blue">
                                {{ keyword }}
                            </a-tag>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="config-category wide">
            <div class="category-heading">
                <h3>导出位置</h3>
            </div>
            <div class="category-content">
                <div class="setting-row">
                    <a-typography-text class="setting-label">默认文件夹</a-typography-text>
                    <div class="export-folder-control">
                        <a-input v-model:value="defaultExportFolder" placeholder="选择默认导出文件夹" allow-clear
                            class="export-folder-input" />
                        <div class="export-folder-actions">
                            <a-button @click="selectDefaultExportFolder">
                                <FolderOpenOutlined />
                                选择
                            </a-button>
                            <a-button @click="openDefaultExportFolder" :disabled="!defaultExportFolder">
                                <FolderOpenOutlined />
                                打开
                            </a-button>
                            <a-button danger @click="clearDefaultExportFolder" :disabled="!defaultExportFolder">
                                <DeleteOutlined />
                                清空
                            </a-button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="config-category wide">
            <div class="category-heading">
                <h3>备份文件</h3>
            </div>
            <div class="category-content">
                <div class="setting-row">
                    <a-typography-text class="setting-label">最大保留数量</a-typography-text>
                    <div class="setting-control">
                        <a-input-number v-model:value="backupMaxFiles" :min="1" :precision="0"
                            class="backup-max-input" />
                        <span class="setting-note">导出后自动保留最近 {{ backupMaxFiles }} 个配置文件</span>
                    </div>
                </div>

                <div class="setting-row align-start">
                    <a-typography-text class="setting-label">备份操作</a-typography-text>
                    <div class="backup-actions">
                        <a-button type="primary" @click="exportConfig">
                            <ExportOutlined />
                            导出备份
                        </a-button>
                        <a-button :type="showImportArea ? 'primary' : 'default'"
                            @click="showImportArea = !showImportArea">
                            <ImportOutlined />
                            导入备份
                        </a-button>
                        <span class="setting-note">备份包含应用配置、变量组和所有环境变量</span>
                    </div>
                </div>

                <div v-if="defaultExportFolder" class="setting-row align-start">
                    <a-typography-text class="setting-label">目录文件</a-typography-text>
                    <div class="backup-file-list">
                        <div class="backup-file-toolbar">
                            <a-button size="small" @click="toggleBackupTimeDisplayMode"
                                :title="isRelativeBackupTime ? '切换为完整时间' : '切换为相对时间'">
                                <ClockCircleOutlined v-if="isRelativeBackupTime" />
                                <CalendarOutlined v-else />
                                {{ isRelativeBackupTime ? '相对时间' : '完整时间' }}
                            </a-button>
                            <a-button size="small" @click="loadBackupFiles" :loading="backupFilesLoading">
                                <ReloadOutlined />
                                刷新
                            </a-button>
                            <a-popconfirm title="确定清理重复备份文件吗？会将配置内容完全相同的旧备份移入回收站。" ok-text="确定"
                                cancel-text="取消" @confirm="cleanupDuplicateBackupFiles">
                                <a-button size="small" danger :loading="cleanupBackupFilesLoading"
                                    :disabled="backupFilesLoading || backupFiles.length === 0">
                                    <DeleteOutlined />
                                    清理重复
                                </a-button>
                            </a-popconfirm>
                            <span class="setting-note">{{ backupFiles.length }} 个配置文件</span>
                        </div>

                        <a-table :dataSource="backupFiles" :columns="backupFileColumns" :loading="backupFilesLoading"
                            :scroll="{ x: 720 }"
                            :pagination="{
                                pageSize: 10,
                                size: 'small',
                                showSizeChanger: true,
                                pageSizeOptions: [10, 20, 50, 100],
                                pageSizeStorageKey: 'config-backup-files'
                            }" :rowKey="record => record.path" size="small" :customRow="getBackupFileRowProps" class="backup-file-table"
                            :locale="{ emptyText: '当前目录没有配置文件' }">
                            <template #bodyCell="{ column, record }">
                                <template v-if="column.key === 'id'">
                                    {{ record.id }}
                                </template>

                                <template v-else-if="column.key === 'exportTime'">
                                    {{ formatBackupFileTime(record) }}
                                </template>

                                <template v-else-if="column.key === 'systemVarCount'">
                                    {{ record.systemVarCount || 0 }}
                                </template>

                                <template v-else-if="column.key === 'userVarCount'">
                                    {{ record.userVarCount || 0 }}
                                </template>

                                <template v-else-if="column.key === 'systemPathItemCount'">
                                    {{ record.systemPathItemCount || 0 }}
                                </template>

                                <template v-else-if="column.key === 'userPathItemCount'">
                                    {{ record.userPathItemCount || 0 }}
                                </template>

                                <template v-else-if="column.key === 'actions'">
                                    <a-space :size="4">
                                        <a-button v-if="record.hasConfigDiff" size="small" type="link"
                                            @click.stop="showBackupConfigDiff(record)">
                                            <EyeOutlined />
                                            差异
                                        </a-button>
                                        <a-button size="small" type="link" @click.stop="importBackupFile(record)">
                                            <ImportOutlined />
                                            导入
                                        </a-button>
                                    </a-space>
                                </template>
                            </template>
                        </a-table>
                    </div>
                </div>

                <div v-if="showImportArea" class="setting-row align-start">
                    <a-typography-text class="setting-label">导入文件</a-typography-text>
                    <div class="import-area">
                        <a-alert type="warning" show-icon class="import-alert">
                            <template #message>
                                <strong>导入须知</strong>
                            </template>
                            <template #description>
                                <ul class="import-tips">
                                    <li>建议在导入前先<strong>导出当前配置</strong>作为备份。</li>
                                    <li>核对差异后可选择<strong>覆盖导入</strong>或<strong>增量导入</strong>。</li>
                                    <li>增量导入只添加当前不存在的配置；Path 变量会合并路径项并去重。</li>
                                </ul>
                            </template>
                        </a-alert>

                        <a-upload-dragger name="file" :multiple="false" accept=".json"
                            :before-upload="handleBeforeUpload" :show-upload-list="false">
                            <p class="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p class="ant-upload-text">点击或将配置文件拖拽到此区域</p>
                            <p class="ant-upload-hint">
                                仅支持 .json 格式的备份文件
                            </p>
                        </a-upload-dragger>
                    </div>
                </div>
            </div>
        </section>

        <ImportDiffModal v-model:open="showDiffModal" :currentConfig="currentConfig" :importConfig="pendingImportConfig"
            @confirm="handleDiffConfirm" />
        </template>
    </div>
</template>

<style scoped>
div.config-view {
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    width: 100%;
    max-width: 1000px;
    box-sizing: border-box;
    padding: 2px 2px 24px;
    margin: 0 auto;
}

.config-category.wide {
    grid-column: 1 / -1;
}

div.config-view.diff-mode {
    max-width: none;
    height: calc(100vh - 64px);
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px;
    margin: 0;
}

.config-category {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 13px 16px 6px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow-xs);
}

.category-heading {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ui-border);
}

.category-heading h3 {
    margin: 0;
    color: var(--ui-text);
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 20px;
}

.category-content {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
}

.setting-row {
    display: grid;
    grid-template-columns: 116px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    min-height: 30px;
    padding: 11px 0;
    border-bottom: 1px solid var(--ui-border);
}

.setting-row:last-child {
    border-bottom: none;
}

.config-category.compact .setting-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 12px 0;
}

.config-category.compact .setting-row.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.config-category.compact .setting-label {
    line-height: 18px;
}

.config-category.compact .category-content {
    gap: 2px;
}

.setting-row.no-label {
    grid-template-columns: minmax(0, 1fr);
}

.setting-row.align-start {
    align-items: flex-start;
}

.setting-label {
    color: var(--ui-text-muted);
    font-size: 13px;
    font-weight: 500;
    line-height: 30px;
    white-space: nowrap;
}

.setting-control,
.backup-actions,
.export-folder-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
}

.setting-note {
    color: var(--ui-text-soft);
    font-size: 12px;
    line-height: 20px;
}

.theme-radio-group {
    display: flex;
    width: 100%;
    max-width: 100%;
}

.theme-radio-group :deep(.ui-radio-button) {
    flex: 1;
    min-width: 0;
    padding: 0 8px;
}

.keyword-control {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.keyword-input-row {
    display: flex;
    gap: 8px;
    width: 100%;
    max-width: 520px;
}

.keyword-input {
    flex: 1;
    min-width: 180px;
}

.keyword-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.export-folder-control {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
}

.export-folder-actions {
    flex-wrap: wrap;
}

.backup-file-list {
    width: 100%;
    min-width: 0;
    overflow-x: auto;
    padding: 10px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-muted);
}

.backup-max-input {
    width: 120px;
}

.backup-file-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
}

.backup-file-name {
    color: var(--ant-color-primary);
    cursor: pointer;
    font-weight: 500;
    word-break: break-all;
}

:deep(.backup-file-table .backup-file-row-clickable) {
    cursor: pointer;
}

:deep(.backup-file-table .ui-table td) {
    vertical-align: middle;
}

:deep(.backup-file-table .ui-table) {
    border-radius: var(--ui-radius-sm);
    overflow: hidden;
}

.import-area {
    width: 100%;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-muted);
}

.import-alert {
    margin-bottom: 16px;
}

.import-tips {
    margin: 0;
    padding-left: 20px;
}

.export-folder-input {
    min-width: 0;
}

.forbidden-item {
    color: var(--ui-text-soft);
}

.type-icon {
    margin-right: 8px;
}

@media (max-width: 900px) {
    div.config-view {
        grid-template-columns: minmax(0, 1fr);
        padding: 0 0 16px;
    }

    .config-category {
        padding: 12px 12px 4px;
    }

    .setting-row {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .export-folder-control {
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
    }

    .setting-label {
        line-height: 22px;
    }

    .keyword-input-row {
        flex-wrap: wrap;
    }
}
</style>
