import { ref, computed, watch } from 'vue'
import { getData, setData } from '../utils/store'

// 存储键名
const SETTINGS_KEY = 'utools-plugin-template-settings'

// 默认设置值
const defaultSettings = {
    theme: 'system',
    primaryColor: '#2563eb',
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', '微软雅黑', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    sensitiveFieldsEnabled: true,
    sensitiveKeywords: ['key', 'token', 'password', 'secret', 'credential', 'auth', 'apikey', 'api_key'],
    layoutMode: 'card', // 'card' | 'table'
    defaultExportFolder: '',
    backupMaxFiles: 100
}

export const DEFAULT_SETTINGS = defaultSettings

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function normalizeColor(value) {
    if (typeof value !== 'string') return defaultSettings.primaryColor
    const color = value.trim().toLowerCase()
    return HEX_COLOR_RE.test(color) ? color : defaultSettings.primaryColor
}

function normalizeFontFamily(value) {
    if (typeof value !== 'string') return defaultSettings.fontFamily
    const font = value.replace(/[<>{}]/g, '').trim()
    return font ? font.slice(0, 200) : defaultSettings.fontFamily
}

function normalizeMaxFiles(value) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) return defaultSettings.backupMaxFiles
    return Math.max(1, Math.floor(numberValue))
}

function normalizeSettings(saved) {
    const merged = { ...defaultSettings, ...(saved || {}) }

    if (saved && saved.backupMaxFiles === undefined && saved.startupExportMaxFiles !== undefined) {
        merged.backupMaxFiles = saved.startupExportMaxFiles
    }

    delete merged.startupExportEnabled
    delete merged.startupExportMaxFiles
    merged.backupMaxFiles = normalizeMaxFiles(merged.backupMaxFiles)
    merged.primaryColor = normalizeColor(merged.primaryColor)
    merged.fontFamily = normalizeFontFamily(merged.fontFamily)
    return merged
}

// 从 dbStorage 加载设置
const loadSettings = () => {
    const saved = getData(SETTINGS_KEY, null)
    if (saved) {
        return normalizeSettings(saved)
    }
    return { ...defaultSettings }
}

// 全局状态
const settings = ref(loadSettings())

// 监听变化并持久化 - 使用 JSON 序列化确保数据可克隆
watch(
    settings,
    (newValue) => {
        // 深拷贝以确保可序列化
        const serializableValue = JSON.parse(JSON.stringify(newValue))
        setData(SETTINGS_KEY, serializableValue)
    },
    { deep: true }
)

/**
 * settings store - 使用 Composition API 和 ZTools dbStorage
 */
export function useSettingsStore() {
    const theme = computed({
        get: () => settings.value.theme,
        set: (val) => { settings.value.theme = val }
    })

    const primaryColor = computed({
        get: () => normalizeColor(settings.value.primaryColor),
        set: (val) => { settings.value.primaryColor = normalizeColor(val) }
    })

    const fontFamily = computed({
        get: () => normalizeFontFamily(settings.value.fontFamily),
        set: (val) => { settings.value.fontFamily = normalizeFontFamily(val) }
    })

    const sensitiveFieldsEnabled = computed({
        get: () => settings.value.sensitiveFieldsEnabled,
        set: (val) => { settings.value.sensitiveFieldsEnabled = val }
    })

    const sensitiveKeywords = computed({
        get: () => settings.value.sensitiveKeywords || [],
        set: (val) => { settings.value.sensitiveKeywords = val }
    })

    const layoutMode = computed({
        get: () => settings.value.layoutMode || 'card',
        set: (val) => { settings.value.layoutMode = val }
    })

    const defaultExportFolder = computed({
        get: () => settings.value.defaultExportFolder || '',
        set: (val) => { settings.value.defaultExportFolder = val || '' }
    })

    const backupMaxFiles = computed({
        get: () => normalizeMaxFiles(settings.value.backupMaxFiles),
        set: (val) => { settings.value.backupMaxFiles = normalizeMaxFiles(val) }
    })

    const setTheme = (theme) => { settings.value.theme = theme }
    const setSensitiveFieldsEnabled = (enabled) => { settings.value.sensitiveFieldsEnabled = enabled }
    const setSensitiveKeywords = (keywords) => { settings.value.sensitiveKeywords = keywords }
    const setLayoutMode = (mode) => { settings.value.layoutMode = mode }
    const setDefaultExportFolder = (folder) => { settings.value.defaultExportFolder = folder || '' }
    const setBackupMaxFiles = (maxFiles) => { settings.value.backupMaxFiles = normalizeMaxFiles(maxFiles) }
    const resetToDefault = () => { settings.value = { ...defaultSettings } }

    return {
        theme,
        setTheme,
        primaryColor,
        fontFamily,
        sensitiveFieldsEnabled,
        setSensitiveFieldsEnabled,
        sensitiveKeywords,
        setSensitiveKeywords,
        layoutMode,
        setLayoutMode,
        defaultExportFolder,
        setDefaultExportFolder,
        backupMaxFiles,
        setBackupMaxFiles,
        resetToDefault
    }
}
