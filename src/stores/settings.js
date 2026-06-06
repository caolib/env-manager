import { ref, computed, watch } from 'vue'
import { getData, setData } from '../utils/store'

// 存储键名
const SETTINGS_KEY = 'utools-plugin-template-settings'

// 默认设置值
const defaultSettings = {
    theme: 'system',
    sensitiveFieldsEnabled: true,
    sensitiveKeywords: ['key', 'token', 'password', 'secret', 'credential', 'auth', 'apikey', 'api_key'],
    layoutMode: 'card', // 'card' | 'table'
    defaultExportFolder: '',
    startupExportEnabled: false,
    startupExportMaxFiles: 10
}

function normalizeMaxFiles(value) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) return defaultSettings.startupExportMaxFiles
    return Math.max(1, Math.floor(numberValue))
}

// 从 dbStorage 加载设置
const loadSettings = () => {
    const saved = getData(SETTINGS_KEY, null)
    if (saved) {
        return { ...defaultSettings, ...saved }
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
 * settings store - 使用 Composition API 和 uTools dbStorage
 */
export function useSettingsStore() {
    const theme = computed({
        get: () => settings.value.theme,
        set: (val) => { settings.value.theme = val }
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

    const startupExportEnabled = computed({
        get: () => !!settings.value.startupExportEnabled,
        set: (val) => { settings.value.startupExportEnabled = !!val }
    })

    const startupExportMaxFiles = computed({
        get: () => normalizeMaxFiles(settings.value.startupExportMaxFiles),
        set: (val) => { settings.value.startupExportMaxFiles = normalizeMaxFiles(val) }
    })

    const setTheme = (theme) => { settings.value.theme = theme }
    const setSensitiveFieldsEnabled = (enabled) => { settings.value.sensitiveFieldsEnabled = enabled }
    const setSensitiveKeywords = (keywords) => { settings.value.sensitiveKeywords = keywords }
    const setLayoutMode = (mode) => { settings.value.layoutMode = mode }
    const setDefaultExportFolder = (folder) => { settings.value.defaultExportFolder = folder || '' }
    const setStartupExportEnabled = (enabled) => { settings.value.startupExportEnabled = !!enabled }
    const setStartupExportMaxFiles = (maxFiles) => { settings.value.startupExportMaxFiles = normalizeMaxFiles(maxFiles) }
    const resetToDefault = () => { settings.value = { ...defaultSettings } }

    return {
        theme,
        setTheme,
        sensitiveFieldsEnabled,
        setSensitiveFieldsEnabled,
        sensitiveKeywords,
        setSensitiveKeywords,
        layoutMode,
        setLayoutMode,
        defaultExportFolder,
        setDefaultExportFolder,
        startupExportEnabled,
        setStartupExportEnabled,
        startupExportMaxFiles,
        setStartupExportMaxFiles,
        resetToDefault
    }
}
