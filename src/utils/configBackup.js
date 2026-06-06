import { message } from '../ui';
import { useSettingsStore } from '../stores/settings';
import { useGroupsStore } from '../stores/groups';
import { getData } from './store';

const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1';
const DISABLED_VARS_KEY = 'env-manager-disabled-vars-v1';

function getBackupTimeParts() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const timestamp = beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 23);
    return { beijingTime, timestamp };
}

function cloneData(value, fallback) {
    try {
        return JSON.parse(JSON.stringify(value ?? fallback));
    } catch {
        return fallback;
    }
}

export function buildCurrentConfig(beijingTime) {
    const settingsStore = useSettingsStore();
    const groupsStore = useGroupsStore();
    const envResult = window.services.getEnvVars();

    return {
        version: '1.2.0',
        exportTime: beijingTime.toISOString(),
        settings: {
            theme: settingsStore.theme.value,
            sensitiveFieldsEnabled: settingsStore.sensitiveFieldsEnabled.value,
            sensitiveKeywords: settingsStore.sensitiveKeywords.value,
            defaultExportFolder: settingsStore.defaultExportFolder.value,
            backupMaxFiles: settingsStore.backupMaxFiles.value
        },
        var_alternatives: cloneData(getData(ALT_VALUES_KEY, { system: {}, user: {} }), { system: {}, user: {} }),
        disabled_vars: cloneData(getData(DISABLED_VARS_KEY, { system: {}, user: {} }), { system: {}, user: {} }),
        groups: cloneData(groupsStore.groups.value, []),
        env_vars: {
            system_vars: envResult.systemVars || [],
            user_vars: envResult.userVars || []
        }
    };
}

export function exportBackupFile(filePrefix, options = {}) {
    const { reveal = false, requireDefaultFolder = false } = options;
    const settingsStore = useSettingsStore();
    const { beijingTime, timestamp } = getBackupTimeParts();
    const fileName = `${filePrefix}-${timestamp}.json`;
    const configData = buildCurrentConfig(beijingTime);
    const exportFolder = settingsStore.defaultExportFolder.value?.trim();

    if (requireDefaultFolder && !exportFolder) {
        return { success: false, skipped: true, message: '请先在配置中设置默认导出文件夹，已跳过自动备份' };
    }

    const result = window.services.exportConfig(
        configData,
        fileName,
        exportFolder,
        settingsStore.backupMaxFiles.value
    );
    if (result.success && reveal) {
        window.services.revealInExplorer(result.path);
    }
    return result;
}

export async function exportAfterVariableChange() {
    try {
        const result = exportBackupFile('env-manager-change', {
            requireDefaultFolder: true
        });

        if (!result.success) {
            message.warning(`变量已修改，但自动备份失败: ${result.message}`);
        }
        return result;
    } catch (error) {
        message.warning(`变量已修改，但自动备份失败: ${error.message}`);
        console.error('Auto backup error:', error);
        return { success: false, message: error.message };
    }
}
