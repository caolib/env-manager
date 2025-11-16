import { ref, computed, watch } from 'vue'
import { getData, setData } from '../utils/store'

// 存储键名
const SETTINGS_KEY = 'utools-plugin-template-settings'

// 默认设置值
const defaultSettings = {
    theme: 'system',
    exportPath: '', // 环境变量导出路径
    autoOpenFolder: true // 导出后自动打开文件夹
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

    const exportPath = computed({
        get: () => settings.value.exportPath,
        set: (val) => { settings.value.exportPath = val }
    })

    const autoOpenFolder = computed({
        get: () => settings.value.autoOpenFolder,
        set: (val) => { settings.value.autoOpenFolder = val }
    })

    const setTheme = (theme) => { settings.value.theme = theme }
    const setExportPath = (path) => { settings.value.exportPath = path }
    const setAutoOpenFolder = (value) => { settings.value.autoOpenFolder = value }
    const resetToDefault = () => { settings.value = { ...defaultSettings } }

    return {
        theme,
        exportPath,
        autoOpenFolder,
        setTheme,
        setExportPath,
        setAutoOpenFolder,
        resetToDefault
    }
}
